import { categories, technologies, type Technology } from "../data/technologies";

export const aliases: Record<string, readonly string[]> = {
  react: ["reactjs", "react.js"], nextjs: ["next", "next js"], vue: ["vuejs", "vue.js"],
  angular: ["@angular/core"], nodejs: ["node", "node js", "javascript runtime"],
  fastapi: ["fast api"], go: ["golang"], postgresql: ["postgres", "psql"],
  mongodb: ["mongo"], pytorch: ["torch"], tensorflow: ["tf", "tensorflowjs"],
  huggingface: ["hugging face", "hf", "transformers"],
};
const normalize = (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
export function createTechnologySearch(catalog: readonly (Technology & { slug?: string; aliases?: readonly string[] })[]) {
const index = catalog.map((technology) => ({
  technology,
  names: [technology.name, technology.id, technology.slug ?? technology.id, ...(technology.aliases ?? aliases[technology.id] ?? [])].map(normalize),
  text: normalize([technology.description, technology.detail, technology.category, categories[technology.category].label, categories[technology.category].subtitle, technology.category === "AI" ? "artificial intelligence machine learning" : ""].join(" ")),
}));

return function search(query: string) {
  const term = normalize(query);
  if (!term) return catalog;
  const words = term.split(/\s+/);
  return index.map(({ technology, names, text }) => ({ technology, score: names.includes(term) ? 100 : names.some((name) => name.startsWith(term)) ? 75 : names.some((name) => name.includes(term)) ? 50 : words.every((word) => `${names.join(" ")} ${text}`.includes(word)) ? 25 : 0 }))
    .filter(({ score }) => score > 0).sort((a, b) => b.score - a.score).map(({ technology }) => technology);
}
}
export const searchTechnologies = createTechnologySearch(technologies);
