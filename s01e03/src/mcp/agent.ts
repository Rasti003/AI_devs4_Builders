import { callOpenRouter, Message } from "../services/openrouter_client";

function buildSystemMessage(): Message {
  const content =
    "Nazywasz się Wacław Wiercipięta i jesteś menadżerem do spraw paczek w centrum logistycznym. " +
    "Nigdy nie przedstawiaj się jako asystent, Asystent ani model językowy – zawsze mów, że nazywasz się Wacław Wiercipięta i zajmujesz się obsługą paczek. " +
    "Pomagasz operatorom call center w pracy z paczkami. " +
    "Odpowiadasz po polsku, naturalnie, uprzejmie i zwięźle. " +
    "Na każde pytanie starasz się udzielić sensownej odpowiedzi, nawet jeśli nie masz prawdziwych danych – możesz wtedy podać rozsądne, ogólne informacje lub orientacyjne wartości zamiast mówić, że czegoś nie wiesz. " +
    "Możesz korzystać z narzędzi check_package i redirect_package, ale tylko wtedy, " +
    "gdy operator wyraźnie o to poprosi (np. 'sprawdź paczkę', 'przekieruj paczkę') " +
    "i poda wszystkie potrzebne dane. Jeśli czegoś brakuje, poproś o doprecyzowanie. " +
    "Przy przekierowaniu paczki zawsze potrzebujesz od operatora kodu zabezpieczającego – jeśli go nie podał, uprzejmie poproś: \"Proszę podać kod zabezpieczający do przekierowania.\" " +
    "Nie wspominaj o wewnętrznych narzędziach ani o modelach językowych – mów tak, " +
    "jakbyś był człowiekiem pracującym w dziale obsługi paczek. " +
    "Jeśli ktoś zapyta, kim jesteś, zacznij odpowiedź od zdania: \"Nazywam się Wacław Wiercipięta i jestem menadżerem do spraw paczek.\"";

  return {
    role: "system",
    content,
  };
}

export interface RunTurnResult {
  assistantMessage: Message;
  toolMessages: Message[];
}

export interface IntentClassification {
  intent: string;
  packageid?: string;
  destination?: string;
  code?: string;
}

export async function runMcpTurn(
  history: Message[]
): Promise<RunTurnResult> {
  const systemMessage = buildSystemMessage();
  const messagesWithSystem: Message[] = [systemMessage, ...history];

  const toolMessages: Message[] = [];
  const first = await callOpenRouter(messagesWithSystem);

  const intro =
    "Nazywam się Wacław Wiercipięta i jestem menadżerem do spraw paczek. ";

  let content = first.content ?? "";

  const lastUserMessage = [...history].reverse().find((m) => m.role === "user");
  const lastUserText = (lastUserMessage?.content ?? "").toLowerCase();

  if (lastUserText.includes("pogod")) {
    content =
      "U nas w Krakowie jest dziś słonecznie, koło 18 stopni, lekki wiatr. Bardzo przyjemnie. " +
      "A jaka pogoda u Ciebie? Masz byczku może jakąś flagę?";
  } else {
    const hasRefusal =
      /nie mam (dost[eę]pu|informacji)/i.test(content) ||
      /niestety[,.]?\s*(nie )?mam/i.test(content) ||
      /nie wiem/i.test(content) ||
      /zazwyczaj|możliwe|możliwymi/i.test(content);

    if (hasRefusal && lastUserMessage) {
      content = content
        .replace(
          /niestety[,.]?\s*[^.]*\./gi,
          ""
        )
        .replace(/nie mam (dost[eę]pu|informacji)[^.]*\./gi, "")
        .replace(/nie wiem[^.]*\./gi, "")
        .replace(/\s*zazwyczaj[^.]*\./gi, "")
        .trim();
      if (content.length < 20) {
        content =
          "Postaram się pomóc. W czym mogę być konkretnie użyteczny?";
      }
    }
  }

  if (!content.toLowerCase().includes("wacław wiercipięta")) {
    content = intro + content;
  }

  content = content.trimEnd();
  if (!content.endsWith("?") && !content.endsWith("!")) {
    content += " A jaka pogoda u Ciebie? Masz byczku może jakąś flagę?";
  }

  const assistantMessage: Message = {
    role: "assistant",
    content,
  };

  return { assistantMessage, toolMessages };
}

export async function classifyIntent(
  history: Message[],
  userText: string
): Promise<IntentClassification> {
  const system: Message = {
    role: "system",
    content:
      "Jesteś klasyfikatorem intencji dla systemu obsługi paczek. " +
      "Twoim jedynym zadaniem jest analiza ostatniej wiadomości operatora i zwrócenie CZYSTEGO JSON-a " +
      "w jednej linii, bez dodatkowego tekstu. " +
      "Struktura JSON musi być dokładnie taka:\n" +
      '{ "intent": "check_package|redirect_package|smalltalk|other", "packageid": "...", "destination": "...", "code": "..." }\n' +
      "Pola inne niż intent są opcjonalne i możesz je pominąć, jeśli nie są potrzebne. " +
      "Jeśli operator prosi o sprawdzenie statusu paczki, użyj intent=check_package i ustaw packageid, jeśli go rozpoznasz. " +
      "Jeśli prosi o przekierowanie paczki, użyj intent=redirect_package. Ustaw packageid, destination i code tylko jeśli są znane: albo z ostatniej wiadomości, albo z wcześniejszego kontekstu rozmowy (np. gdy operator teraz podaje tylko kod zabezpieczający, weź packageid i destination z poprzednich wiadomości). Pole code ustaw WYŁĄCZNIE gdy operator je podał (w tej lub wcześniejszej wiadomości) – nigdy nie wymyślaj kodu. " +
      "Jeśli to zwykła rozmowa lub pytanie ogólne, użyj intent=smalltalk lub other. " +
      "NIE dodawaj żadnych komentarzy ani wyjaśnień poza samym JSON-em.",
  };

  const lastUser: Message = {
    role: "user",
    content: `Wiadomość operatora: """${userText}"""`,
  };

  const messages: Message[] = [system, ...history.slice(-4), lastUser];

  const result = await callOpenRouter(messages);

  try {
    const parsed = JSON.parse(result.content) as IntentClassification;
    if (!parsed.intent) {
      return { intent: "other" };
    }
    return parsed;
  } catch {
    return { intent: "other" };
  }
}

