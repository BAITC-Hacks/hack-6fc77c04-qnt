import { defineConfig, loadEnv } from "vite";
import { socialImageUrl } from "./social-meta";
export default defineConfig(({ mode }) => {
  const image = socialImageUrl(
    loadEnv(mode, ".", "VITE_").VITE_PUBLIC_SITE_URL,
  );
  return {
    plugins: [
      {
        name: "qnt-social-image",
        transformIndexHtml() {
          return image
            ? [
                {
                  tag: "meta",
                  attrs: { property: "og:image", content: image },
                  injectTo: "head",
                },
                {
                  tag: "meta",
                  attrs: { property: "og:image:width", content: "1200" },
                  injectTo: "head",
                },
                {
                  tag: "meta",
                  attrs: { property: "og:image:height", content: "630" },
                  injectTo: "head",
                },
                {
                  tag: "meta",
                  attrs: { property: "og:image:type", content: "image/png" },
                  injectTo: "head",
                },
                {
                  tag: "meta",
                  attrs: {
                    property: "og:image:alt",
                    content: "QNT Match — ваше событие, подходящие люди",
                  },
                  injectTo: "head",
                },
                {
                  tag: "meta",
                  attrs: { name: "twitter:image", content: image },
                  injectTo: "head",
                },
                {
                  tag: "meta",
                  attrs: {
                    name: "twitter:image:alt",
                    content: "QNT Match — ваше событие, подходящие люди",
                  },
                  injectTo: "head",
                },
              ]
            : [];
        },
      },
    ],
    server: { proxy: { "/api": "http://127.0.0.1:8000" } },
    build: { outDir: "dist" },
  };
});
