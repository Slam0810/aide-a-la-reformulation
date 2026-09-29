import { NextRequest, NextResponse } from "next/server";
import mammoth from "mammoth";

export const runtime = "nodejs";

const MAX_SIZE_BYTES = 15 * 1024 * 1024; // 15 Mo

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get("file");

    if (!file || !(file instanceof Blob)) {
      return NextResponse.json(
        { error: "Aucun fichier reçu." },
        { status: 400 }
      );
    }

    if (file.size > MAX_SIZE_BYTES) {
      return NextResponse.json(
        { error: "Le fichier dépasse la taille maximale autorisée (15 Mo)." },
        { status: 400 }
      );
    }

    const filename = (file as File).name || "";
    const extension = filename.split(".").pop()?.toLowerCase();
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    let text = "";

    if (extension === "txt" || file.type === "text/plain") {
      text = buffer.toString("utf-8");
    } else if (
      extension === "docx" ||
      file.type ===
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    ) {
      const result = await mammoth.extractRawText({ buffer });
      text = result.value;
    } else if (extension === "pdf" || file.type === "application/pdf") {
      // Imported dynamically: pdf-parse reads a bundled test file at import
      // time in some setups, so it is only loaded when actually needed.
      const pdfParse = (await import("pdf-parse")).default;
      const result = await pdfParse(buffer);
      text = result.text;
    } else {
      return NextResponse.json(
        {
          error:
            "Format non pris en charge. Formats acceptés : .txt, .docx, .pdf."
        },
        { status: 400 }
      );
    }

    text = text.replace(/\r\n/g, "\n").trim();

    if (!text) {
      return NextResponse.json(
        {
          error:
            "Aucun texte n'a pu être extrait de ce document (il est peut-être scanné en image)."
        },
        { status: 422 }
      );
    }

    return NextResponse.json({ text });
  } catch (err: any) {
    console.error("Erreur /api/import", err);
    return NextResponse.json(
      { error: err?.message || "Erreur lors de la lecture du document." },
      { status: 500 }
    );
  }
}
