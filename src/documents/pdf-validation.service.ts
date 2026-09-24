import {
  BadRequestException,
  Injectable,
} from '@nestjs/common';

import {
  PDFArray,
  PDFDict,
  PDFDocument,
  PDFName,
  PDFObject,
  PDFRef,
} from 'pdf-lib';

export interface PdfValidationResult {
  mimeType: 'application/pdf';

  size: number;

  version: string;

  pageCount: number;
}

@Injectable()
export class PdfValidationService {
  private readonly maxFileSize =
    10 * 1024 * 1024;

  /*
   * Actions que a Vera não permite
   * dentro de documentos registados.
   *
   * Isto verifica objetos reais da
   * estrutura PDF, não palavras
   * encontradas no conteúdo visual.
   */
  private readonly forbiddenActionTypes =
    new Set([
      '/JavaScript',
      '/Launch',
      '/SubmitForm',
      '/ImportData',
      '/Rendition',
      '/Movie',
      '/Sound',
    ]);

  async validate(
    buffer: Buffer,
  ): Promise<PdfValidationResult> {
    if (
      !Buffer.isBuffer(buffer) ||
      buffer.length === 0
    ) {
      throw new BadRequestException(
        'O ficheiro enviado está vazio.',
      );
    }

    if (
      buffer.length >
      this.maxFileSize
    ) {
      throw new BadRequestException(
        'O ficheiro excede o limite máximo de 10 MB.',
      );
    }

    /*
     * 1. Assinatura real do ficheiro.
     *
     * Não confiamos no nome,
     * extensão ou MIME declarado
     * pelo cliente.
     */
    const header =
      buffer
        .subarray(
          0,
          Math.min(
            buffer.length,
            16,
          ),
        )
        .toString('latin1');

    const headerMatch =
      header.match(
        /^%PDF-(1\.[0-7]|2\.0)/,
      );

    if (!headerMatch) {
      throw new BadRequestException(
        'O ficheiro enviado não possui uma assinatura PDF válida.',
      );
    }

    const pdfVersion =
      headerMatch[1];

    /*
     * 2. Último %%EOF.
     */
    const eofMarker =
      Buffer.from(
        '%%EOF',
        'ascii',
      );

    const eofIndex =
      buffer.lastIndexOf(
        eofMarker,
      );

    if (eofIndex < 0) {
      throw new BadRequestException(
        'O ficheiro PDF está incompleto: marcador EOF não encontrado.',
      );
    }

    /*
     * Depois do último %%EOF só
     * permitimos whitespace.
     */
    const trailingBytes =
      buffer.subarray(
        eofIndex +
          eofMarker.length,
      );

    const trailingContent =
      trailingBytes.toString(
        'latin1',
      );

    if (
      !/^[\x09\x0A\x0C\x0D\x20]*$/.test(
        trailingContent,
      )
    ) {
      throw new BadRequestException(
        'Foram encontrados dados inesperados depois do fim do PDF.',
      );
    }

    /*
     * 3. Parsing estrutural.
     */
    let pdf: PDFDocument;
    let pageCount: number;

    try {
      pdf =
        await PDFDocument.load(
          buffer,
          {
            ignoreEncryption:
              false,

            throwOnInvalidObject:
              true,

            updateMetadata:
              false,
          },
        );

      /*
       * Força resolução da árvore
       * real de páginas.
       */
      const pages =
        pdf.getPages();

      pageCount =
        pages.length;

      for (
        let index = 0;
        index < pageCount;
        index += 1
      ) {
        const page =
          pdf.getPage(index);

        const width =
          page.getWidth();

        const height =
          page.getHeight();

        if (
          !Number.isFinite(
            width,
          ) ||
          !Number.isFinite(
            height,
          ) ||
          width <= 0 ||
          height <= 0
        ) {
          throw new Error(
            'Invalid page dimensions',
          );
        }
      }
    } catch {
      throw new BadRequestException(
        'O ficheiro não pôde ser interpretado como um PDF estruturalmente válido.',
      );
    }

    if (
      !Number.isSafeInteger(
        pageCount,
      ) ||
      pageCount < 1
    ) {
      throw new BadRequestException(
        'O PDF precisa conter pelo menos uma página válida.',
      );
    }

    /*
     * 4. Política estrutural
     * de segurança.
     *
     * Não procuramos palavras
     * nos bytes do documento.
     *
     * Inspecionamos objetos reais
     * da estrutura PDF.
     */
    this.inspectDocumentStructure(
      pdf,
    );

    return {
      mimeType:
        'application/pdf',

      size:
        buffer.length,

      version:
        pdfVersion,

      pageCount,
    };
  }

  private inspectDocumentStructure(
    pdf: PDFDocument,
  ): void {
    this.inspectCatalog(
      pdf,
    );

    const visitedRefs =
      new Set<string>();

    const visitedObjects =
      new Set<PDFObject>();

    const visit = (
      rawObject:
        PDFObject |
        undefined,

      depth:
        number,
    ): void => {
      if (!rawObject) {
        return;
      }

      if (depth > 128) {
        throw new BadRequestException(
          'O PDF possui uma estrutura interna excessivamente complexa.',
        );
      }

      /*
       * IMPORTANTE:
       *
       * lookup() pode devolver undefined.
       *
       * Por isso a variável precisa
       * explicitamente aceitar:
       *
       * PDFObject | undefined
       */
      let object:
        PDFObject |
        undefined =
        rawObject;

      if (
        object instanceof
        PDFRef
      ) {
        const refKey =
          object.toString();

        if (
          visitedRefs.has(
            refKey,
          )
        ) {
          return;
        }

        visitedRefs.add(
          refKey,
        );

        try {
          object =
            pdf.context.lookup(
              object,
            );
        } catch {
          throw new BadRequestException(
            'O PDF contém referências internas inválidas.',
          );
        }

        if (!object) {
          throw new BadRequestException(
            'O PDF contém uma referência interna não resolvida.',
          );
        }
      }

      /*
       * A partir daqui object já foi
       * reduzido novamente para
       * PDFObject.
       */
      if (!object) {
        return;
      }

      if (
        visitedObjects.has(
          object,
        )
      ) {
        return;
      }

      visitedObjects.add(
        object,
      );

      if (
        object instanceof
        PDFDict
      ) {
        this.inspectDictionary(
          pdf,
          object,
        );

        for (
          const [, value]
          of object.entries()
        ) {
          visit(
            value,
            depth + 1,
          );
        }

        return;
      }

      if (
        object instanceof
        PDFArray
      ) {
        for (
          let index = 0;
          index <
            object.size();
          index += 1
        ) {
          visit(
            object.get(
              index,
            ),
            depth + 1,
          );
        }
      }

      /*
       * Não analisamos texto visual
       * como se fosse código.
       *
       * Portanto um livro pode conter:
       *
       * /JavaScript
       * /OpenAction
       * /Launch
       *
       * no conteúdo da página sem
       * ser automaticamente rejeitado.
       */
    };

    visit(
      pdf.catalog,
      0,
    );
  }

  private inspectCatalog(
    pdf: PDFDocument,
  ): void {
    const catalog =
      pdf.catalog;

    /*
     * OpenAction pode ser:
     *
     * - destination
     * - action dictionary
     *
     * Destinations normais são
     * permitidas.
     *
     * Actions automáticas são
     * analisadas.
     */
    const openAction =
      this.resolveObject(
        pdf,

        catalog.get(
          PDFName.of(
            'OpenAction',
          ),
        ),
      );

    if (
      openAction instanceof
      PDFDict
    ) {
      const actionType =
        this.getDictionaryName(
          pdf,
          openAction,
          'S',
        );

      if (actionType) {
        throw new BadRequestException(
          `O PDF contém uma ação automática não permitida: ${actionType}.`,
        );
      }
    }

    /*
     * Additional Actions.
     */
    if (
      catalog.has(
        PDFName.of('AA'),
      )
    ) {
      throw new BadRequestException(
        'O PDF contém ações automáticas adicionais não permitidas.',
      );
    }

    /*
     * Name Trees.
     */
    const names =
      this.resolveObject(
        pdf,

        catalog.get(
          PDFName.of(
            'Names',
          ),
        ),
      );

    if (
      names instanceof
      PDFDict
    ) {
      if (
        names.has(
          PDFName.of(
            'JavaScript',
          ),
        )
      ) {
        throw new BadRequestException(
          'O PDF contém JavaScript executável.',
        );
      }

      if (
        names.has(
          PDFName.of(
            'EmbeddedFiles',
          ),
        )
      ) {
        throw new BadRequestException(
          'O PDF contém ficheiros incorporados, que não são permitidos pela Vera.',
        );
      }
    }

    /*
     * XFA dentro de AcroForm.
     */
    const acroForm =
      this.resolveObject(
        pdf,

        catalog.get(
          PDFName.of(
            'AcroForm',
          ),
        ),
      );

    if (
      acroForm instanceof
        PDFDict &&
      acroForm.has(
        PDFName.of(
          'XFA',
        ),
      )
    ) {
      throw new BadRequestException(
        'O PDF contém formulários XFA, que não são permitidos pela Vera.',
      );
    }
  }

  private inspectDictionary(
    pdf: PDFDocument,
    dictionary: PDFDict,
  ): void {
    /*
     * Action dictionary:
     *
     * <<
     *   /S /JavaScript
     *   /JS (...)
     * >>
     */
    const actionType =
      this.getDictionaryName(
        pdf,
        dictionary,
        'S',
      );

    if (
      actionType &&
      this.forbiddenActionTypes
        .has(
          actionType,
        )
    ) {
      throw new BadRequestException(
        `O PDF contém uma ação não permitida: ${actionType}.`,
      );
    }

    /*
     * Additional Actions podem
     * existir em:
     *
     * - páginas
     * - annotations
     * - fields
     * - widgets
     */
    if (
      dictionary.has(
        PDFName.of('AA'),
      )
    ) {
      throw new BadRequestException(
        'O PDF contém ações automáticas adicionais não permitidas.',
      );
    }

    /*
     * XFA.
     */
    if (
      dictionary.has(
        PDFName.of('XFA'),
      )
    ) {
      throw new BadRequestException(
        'O PDF contém formulários XFA, que não são permitidos pela Vera.',
      );
    }

    /*
     * Embedded file stream.
     */
    const type =
      this.getDictionaryName(
        pdf,
        dictionary,
        'Type',
      );

    if (
      type ===
      '/EmbeddedFile'
    ) {
      throw new BadRequestException(
        'O PDF contém um ficheiro incorporado, que não é permitido pela Vera.',
      );
    }

    /*
     * Annotations perigosas.
     */
    const subtype =
      this.getDictionaryName(
        pdf,
        dictionary,
        'Subtype',
      );

    if (
      subtype ===
        '/RichMedia' ||
      subtype ===
        '/FileAttachment'
    ) {
      throw new BadRequestException(
        `O PDF contém um tipo de conteúdo não permitido: ${subtype}.`,
      );
    }
  }

  private getDictionaryName(
    pdf: PDFDocument,
    dictionary: PDFDict,
    key: string,
  ): string | null {
    const value =
      this.resolveObject(
        pdf,

        dictionary.get(
          PDFName.of(key),
        ),
      );

    if (
      value instanceof
      PDFName
    ) {
      return value.toString();
    }

    return null;
  }

  private resolveObject(
    pdf: PDFDocument,

    object:
      PDFObject |
      undefined,
  ):
    PDFObject |
    undefined {
    if (!object) {
      return undefined;
    }

    if (
      object instanceof
      PDFRef
    ) {
      try {
        return pdf.context
          .lookup(
            object,
          );
      } catch {
        throw new BadRequestException(
          'O PDF contém uma referência interna inválida.',
        );
      }
    }

    return object;
  }
}