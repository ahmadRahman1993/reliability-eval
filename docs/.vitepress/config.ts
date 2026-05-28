import { defineConfig } from "vitepress";

export default defineConfig({
  title: "reliability-eval",
  description: "Calibration-first LLM evaluation for Node/TypeScript",
  themeConfig: {
    nav: [
      { text: "Guide", link: "/guide/getting-started" },
      { text: "API", link: "/api/" },
    ],
    sidebar: [
      {
        text: "Guide",
        items: [
          { text: "Getting Started", link: "/guide/getting-started" },
          { text: "Calibration", link: "/guide/calibration" },
          { text: "Comparing Models", link: "/guide/comparing-models" },
        ],
      },
      {
        text: "Reference",
        items: [{ text: "API", link: "/api/" }],
      },
    ],
    socialLinks: [
      {
        icon: "github",
        link: "https://github.com/ahmadRahman1993/reliability-eval",
      },
    ],
    footer: {
      message: "Released under the MIT License.",
    },
  },
});
