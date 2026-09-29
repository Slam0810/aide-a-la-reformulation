import { NextRequest, NextResponse } from "next/server";
import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  HeadingLevel
} from "docx";
import { CRITERIA, Requirement, requirementScore } from "@/lib/requirements";

export const runtime = "nodejs";

function unmetCriteriaLabels(req: Requirement): string[] {
  return CRITERIA.filter((c) => !req.criteria?.[c.key]).map((c) => c.label);
}

function scoreLine(req: Requirement): string {
  const score = requirementScore(req);
  const total = CRITERIA.length;
  if (score === total) {
    return `Conforme (${score}/${total})`;
  }
  const unmet = unmetCriteriaLabels(req);
  return `${score}/${total} — à revoir : ${unmet.join(", ")}`;
}

async function buildDocxBuffer(requirements: Requirement[]): Promise<Buffer> {
  const paragraphs: Paragraph[] = [
    new Paragraph({
      text: "Exigences reformulées",
      heading: HeadingLevel.TITLE
    }),
    new Paragraph({
      children: [
        new TextRun({
          text: "Conforme à la norme ISO/IEC/IEEE 29148",
          italics: true,
          color: "565F5C"
        })
      ],
      spacing: { after: 300 }
    })
  ];

  let previousSection: string | null = null;

  for (const req of requirements) {
    if (req.section !== previousSection) {
      paragraphs.push(
        new Paragraph({
          text: req.section,
          heading: HeadingLevel.HEADING_2,
          spacing: { before: 300, after: 150 }
        })
      );
      previousSection = req.section;
    }

    paragraphs.push(
      new Paragraph({
        spacing: { after: 40 },
        children: [
          new TextRun({ text: `${req.id} `, bold: true }),
          new TextRun({ text: req.text })
        ]
      })
    );

    paragraphs.push(
      new Paragraph({
        spacing: { after: 30 },
        children: [
          new TextRun({
            text: scoreLine(req),
            italics: true,
            size: 18,
            color:
              requirementScore(req) === CRITERIA.length ? "4C7A51" : "B8863B"
          })
        ]
      })
    );

    if (req.clarification) {
      paragraphs.push(
        new Paragraph({
          spacing: { after: 100 },
          children: [
            new TextRun({
              text: `⚠ ${req.clarification}`,
              italics: true,
              size: 18,
              color: "B8863B"
            })
          ]
        })
      );
    }

    for (const sc of req.acceptanceCriteria || []) {
      paragraphs.push(
        new Paragraph({
          spacing: { before: 60, after: 20 },
          children: [
            new TextRun({ text: `Scénario : ${sc.scenario}`, bold: true, size: 20 })
          ]
        })
      );
      const steps: [string, string][] = [
        ["Étant donné", sc.given],
        ["Quand", sc.when],
        ["Alors", sc.then]
      ];
      for (const [keyword, value] of steps) {
        paragraphs.push(
          new Paragraph({
            indent: { left: 360 },
            spacing: { after: 20 },
            children: [
              new TextRun({ text: `${keyword} `, bold: true, size: 20, color: "2F5D62" }),
              new TextRun({ text: value, size: 20 })
            ]
          })
        );
      }
    }

    paragraphs.push(new Paragraph({ spacing: { after: 160 }, children: [] }));
  }

  const doc = new Document({
    sections: [
      {
        properties: {},
        children: paragraphs
      }
    ]
  });

  return Packer.toBuffer(doc);
}

async function buildPdfBuffer(requirements: Requirement[]): Promise<Buffer> {
  const PDFDocument = (await import("pdfkit")).default;

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 56 });
    const chunks: Buffer[] = [];

    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    doc.font("Helvetica-Bold").fontSize(18).text("Exigences reformulées");
    doc
      .font("Helvetica-Oblique")
      .fontSize(10)
      .fillColor("#565F5C")
      .text("Conforme à la norme ISO/IEC/IEEE 29148");
    doc.moveDown(1);

    let previousSection: string | null = null;

    for (const req of requirements) {
      if (req.section !== previousSection) {
        doc.moveDown(0.5);
        doc.fillColor("#1C2321").font("Helvetica-Bold").fontSize(13).text(req.section);
        doc.moveDown(0.3);
        previousSection = req.section;
      }

      doc.font("Helvetica-Bold").fontSize(11).fillColor("#1C2321").text(`${req.id} `, {
        continued: true
      });
      doc.font("Helvetica").fontSize(11).text(req.text);

      const score = requirementScore(req);
      const conform = score === CRITERIA.length;
      doc
        .font("Helvetica-Oblique")
        .fontSize(9)
        .fillColor(conform ? "#4C7A51" : "#B8863B")
        .text(scoreLine(req));

      if (req.clarification) {
        doc
          .font("Helvetica-Oblique")
          .fontSize(9)
          .fillColor("#B8863B")
          .text(`⚠ ${req.clarification}`);
      }

      for (const sc of req.acceptanceCriteria || []) {
        doc.moveDown(0.15);
        doc
          .fillColor("#1C2321")
          .font("Helvetica-Bold")
          .fontSize(10)
          .text(`Scénario : ${sc.scenario}`, { indent: 14 });

        const steps: [string, string][] = [
          ["Étant donné ", sc.given],
          ["Quand ", sc.when],
          ["Alors ", sc.then]
        ];
        for (const [keyword, value] of steps) {
          doc.font("Helvetica-Bold").fontSize(9.5).fillColor("#2F5D62").text(keyword, {
            indent: 28,
            continued: true
          });
          doc.font("Helvetica").fontSize(9.5).fillColor("#1C2321").text(value);
        }
      }

      doc.fillColor("#1C2321");
      doc.moveDown(0.6);
    }

    doc.end();
  });
}

export async function POST(req: NextRequest) {
  try {
    const { requirements, format } = await req.json();

    if (!Array.isArray(requirements) || requirements.length === 0) {
      return NextResponse.json(
        { error: "Aucune exigence à exporter." },
        { status: 400 }
      );
    }

    if (format !== "docx" && format !== "pdf") {
      return NextResponse.json(
        { error: "Format d'export non pris en charge." },
        { status: 400 }
      );
    }

    if (format === "docx") {
      const buffer = await buildDocxBuffer(requirements);
      return new NextResponse(new Uint8Array(buffer), {
        status: 200,
        headers: {
          "Content-Type":
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
          "Content-Disposition":
            'attachment; filename="besoins-reformules.docx"'
        }
      });
    }

    const buffer = await buildPdfBuffer(requirements);
    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": 'attachment; filename="besoins-reformules.pdf"'
      }
    });
  } catch (err: any) {
    console.error("Erreur /api/export", err);
    return NextResponse.json(
      { error: err?.message || "Erreur lors de l'export." },
      { status: 500 }
    );
  }
}
