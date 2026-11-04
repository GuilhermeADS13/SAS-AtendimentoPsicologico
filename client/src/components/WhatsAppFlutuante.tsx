import { WhatsAppIcon } from "@/components/WhatsAppIcon";
import { linkWhatsAppDoSuporte } from "@/lib/suporte";

/**
 * Botão de WhatsApp fixo no canto, só no celular e só nas páginas públicas (início
 * e preços): é ali que quem chega pelas redes tem dúvida antes de criar a conta. No
 * computador o "Fale comigo" e a Ajuda já estão à vista. Some se não houver número.
 */
export function WhatsAppFlutuante() {
  const link = linkWhatsAppDoSuporte("Olá! Vim pelo site do VozInterior e quero saber mais.");
  if (!link) return null;
  return (
    <a
      href={link}
      target="_blank"
      rel="noopener noreferrer"
      aria-label="Falar com a gente no WhatsApp"
      className="fixed right-4 z-40 flex h-14 w-14 items-center justify-center rounded-full bg-[#1f8f4e] text-white shadow-lg ring-1 ring-black/10 transition-transform hover:scale-105 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#1f8f4e]/40 md:hidden"
      style={{ bottom: "max(1rem, env(safe-area-inset-bottom))" }}
    >
      <WhatsAppIcon className="h-7 w-7" />
    </a>
  );
}
