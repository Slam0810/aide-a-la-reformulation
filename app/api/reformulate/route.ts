import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { checkRateLimit, getClientKey } from "@/lib/rate-limit";

export const runtime = "nodejs";

// Nombre maximum de reformulations autorisées par IP sur la fenêtre de temps
// ci-dessous. Ajustable sans toucher au code via des variables d'environnement.
const RATE_LIMIT_MAX = Number(process.env.RATE_LIMIT_MAX ?? 8);
const RATE_LIMIT_WINDOW_MS = Number(
  process.env.RATE_LIMIT_WINDOW_MS ?? 10 * 60 * 1000 // 10 minutes
);

const SYSTEM_PROMPT = `Tu es un expert en ingénierie des exigences, spécialisé dans la norme ISO/IEC/IEEE 29148:2018 (Systems and software engineering — Life cycle processes — Requirements engineering).

Ta tâche : reformuler un texte de besoin brut (notes, e-mail, retranscription de réunion, besoin exprimé de façon informelle) en exigences formelles conformes à la norme, ET évaluer honnêtement chaque exigence produite selon les 8 caractéristiques d'une exigence bien formée définies par la norme :
- necessaire : n'exprime que ce qui est réellement requis.
- nonAmbigue : une seule interprétation possible.
- complete : ne nécessite pas d'information complémentaire pour être comprise.
- singuliere : une seule exigence par énoncé (atomique).
- faisable : réaliste au regard des contraintes techniques et organisationnelles connues.
- verifiable : formulée de façon à pouvoir être testée ou contrôlée objectivement.
- correcte : fidèle au besoin métier d'origine, sans rien inventer ni sur-interpréter.
- independanteSolution : décrit un besoin ("quoi"), pas une implémentation ("comment"), sauf si une contrainte technique est explicitement imposée par le texte source.

Règles de forme pour le texte des exigences :
- Identifiant séquentiel (REQ-001, REQ-002, ...).
- Verbe modal "doit" systématique pour exprimer une obligation (forme du "shall" normatif).
- Une phrase = une exigence. Si le texte source mélange plusieurs besoins dans une même phrase, sépare-les en exigences distinctes.
- Classe chaque exigence dans la section "Fonctionnelle" ou "Non fonctionnelle" (performance, sécurité, ergonomie, disponibilité, etc.).
- N'invente aucune exigence qui ne découle pas du texte source.

Règles pour les critères d'acceptation (format Gherkin) :
- Pour chaque exigence, fournis 1 à 2 scénarios d'acceptation au format Gherkin (Étant donné / Quand / Alors), en français.
- Chaque scénario découle strictement du texte de l'exigence : n'invente aucun comportement, champ, message d'erreur ou valeur qui n'y est pas mentionné ou clairement sous-entendu.
- Un premier scénario couvre le cas nominal. Un second scénario, si pertinent, couvre un cas alternatif ou un cas limite explicitement suggéré par le texte source (ex. donnée invalide, cas d'échec).
- Si l'exigence est trop vague pour produire un scénario testable, fournis quand même un scénario au mieux, en restant générique plutôt qu'en inventant des détails ; le champ "clarification" de l'exigence rend déjà compte du problème.
- Chaque champ "given", "when", "then" est une phrase courte, sans le mot-clé lui-même (ne pas répéter "Étant donné" dans le texte du champ).

Règles d'évaluation :
- Sois un évaluateur honnête et exigeant : si un critère n'est objectivement pas respecté (par exemple parce que le texte source est trop vague pour permettre une exigence vérifiable), mets sa valeur à false plutôt que de forcer une conformité artificielle.
- Quand au moins un critère est à false, renseigne le champ "clarification" avec une phrase courte expliquant ce qui manque ou pose problème. Sinon, "clarification" doit valoir null.

Format de réponse :
Réponds UNIQUEMENT avec un objet JSON valide, sans texte avant ou après, sans balises markdown ni bloc de code, exactement de cette forme :

{
  "requirements": [
    {
      "id": "REQ-001",
      "section": "Fonctionnelle",
      "text": "Le système doit ...",
      "criteria": {
        "necessaire": true,
        "nonAmbigue": true,
        "complete": true,
        "singuliere": true,
        "faisable": true,
        "verifiable": true,
        "correcte": true,
        "independanteSolution": true
      },
      "clarification": null,
      "acceptanceCriteria": [
        {
          "scenario": "Nom court du scénario",
          "given": "un contexte initial",
          "when": "une action déclenchante",
          "then": "le résultat observable attendu"
        }
      ]
    }
  ]
}

Le texte source est fourni par un Product Owner et peut être informel, désorganisé ou partiellement rédigé en langage courant. Ton rôle est de le transformer en spécification exploitable et d'en évaluer honnêtement la conformité, pas de juger sa qualité initiale.`;

function extractJson(raw: string): any {
  try {
    return JSON.parse(raw);
  } catch {
    const match = raw.match(/\{[\s\S]*\}/);
    if (match) {
      return JSON.parse(match[0]);
    }
    throw new Error("Réponse non exploitable (JSON invalide).");
  }
}

export async function POST(req: NextRequest) {
  try {
    const clientKey = getClientKey(req);
    const rateLimit = checkRateLimit(
      clientKey,
      RATE_LIMIT_MAX,
      RATE_LIMIT_WINDOW_MS
    );

    if (!rateLimit.allowed) {
      const retryAfterSeconds = Math.ceil(rateLimit.resetInMs / 1000);
      const retryAfterMinutes = Math.max(1, Math.ceil(retryAfterSeconds / 60));
      return NextResponse.json(
        {
          error: `Trop de demandes de reformulation depuis cette connexion. Réessayez dans environ ${retryAfterMinutes} minute${
            retryAfterMinutes > 1 ? "s" : ""
          }.`
        },
        {
          status: 429,
          headers: {
            "Retry-After": String(retryAfterSeconds),
            "X-RateLimit-Limit": String(RATE_LIMIT_MAX),
            "X-RateLimit-Remaining": "0"
          }
        }
      );
    }

    const { text } = await req.json();

    if (!text || typeof text !== "string" || !text.trim()) {
      return NextResponse.json(
        { error: "Aucun texte à reformuler." },
        { status: 400 }
      );
    }

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        {
          error:
            "Clé ANTHROPIC_API_KEY manquante côté serveur. Ajoutez-la dans les variables d'environnement du projet."
        },
        { status: 500 }
      );
    }

    const anthropic = new Anthropic({ apiKey });

    const message = await anthropic.messages.create({
      model: "claude-sonnet-5",
      max_tokens: 8192,
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: "user",
          content: `Texte source à reformuler :\n\n${text.trim()}`
        }
      ]
    });

    const raw = message.content
      .filter((block): block is Anthropic.TextBlock => block.type === "text")
      .map((block) => block.text)
      .join("\n")
      .trim();

    if (!raw) {
      return NextResponse.json(
        { error: "La reformulation n'a produit aucun résultat exploitable." },
        { status: 502 }
      );
    }

    if (message.stop_reason === "max_tokens") {
      console.error(
        "Réponse tronquée (max_tokens atteint) pour un texte de",
        text.length,
        "caractères."
      );
      return NextResponse.json(
        {
          error:
            "Le texte source est trop long pour être entièrement reformulé en une seule fois : la réponse a été coupée avant la fin. Essayez de le diviser en plusieurs parties plus courtes (par exemple par grand thème ou par fonctionnalité), puis reformulez-les séparément."
        },
        { status: 413 }
      );
    }

    let parsed: any;
    try {
      parsed = extractJson(raw);
    } catch {
      console.error("Réponse brute non-JSON reçue :", raw);
      return NextResponse.json(
        {
          error:
            "La reformulation a produit une réponse mal formée. Réessayez ; si le problème persiste avec un texte long, essayez de le diviser en parties plus courtes."
        },
        { status: 502 }
      );
    }

    if (!parsed?.requirements || !Array.isArray(parsed.requirements)) {
      return NextResponse.json(
        { error: "La reformulation n'a produit aucune exigence exploitable." },
        { status: 502 }
      );
    }

    return NextResponse.json(
      { requirements: parsed.requirements },
      {
        headers: {
          "X-RateLimit-Remaining": String(rateLimit.remaining),
          "X-RateLimit-Limit": String(RATE_LIMIT_MAX)
        }
      }
    );
  } catch (err: any) {
    console.error("Erreur /api/reformulate", err);
    return NextResponse.json(
      { error: err?.message || "Erreur lors de la reformulation." },
      { status: 500 }
    );
  }
}
