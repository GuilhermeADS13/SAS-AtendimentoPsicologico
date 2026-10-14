import { defaultRehypePlugins, type StreamdownProps } from "streamdown";
import { rehypeHtmlSeguro } from "@shared/htmlSeguro";

type Plugin = NonNullable<StreamdownProps["rehypePlugins"]>[number];

/**
 * Plugins do Streamdown com o filtro de HTML (shared/htmlSeguro) logo depois do
 * rehype-raw. Todo markdown que a tela exibe passa por aqui — ver o porquê no
 * próprio filtro. Os demais plugins padrão do Streamdown continuam.
 */
export const PLUGINS_REHYPE_SEGUROS: Plugin[] = [
  defaultRehypePlugins.raw,
  rehypeHtmlSeguro as unknown as Plugin,
  defaultRehypePlugins.harden,
  defaultRehypePlugins.katex,
];
