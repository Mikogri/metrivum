import { createContext, useContext, type ReactNode } from "react";
import type { Locale } from "~/shared/i18n/locale";
import { publicEn, type PublicMessages } from "~/shared/i18n/messages/public.en";
import { publicPl } from "~/shared/i18n/messages/public.pl";

const dictionaries: Record<Locale, PublicMessages> = { en: publicEn, pl: publicPl };
const MessagesContext = createContext<PublicMessages>(publicEn);

export function PublicMessagesProvider({ locale, children }: { locale: Locale; children: ReactNode }) {
  return <MessagesContext.Provider value={dictionaries[locale]}>{children}</MessagesContext.Provider>;
}

export function usePublicMessages(): PublicMessages {
  return useContext(MessagesContext);
}

export function publicMessages(locale: Locale): PublicMessages {
  return dictionaries[locale];
}
