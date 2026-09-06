interface TechnologySource {
  github: string;
  npm?: string;
  githubNote?: string;
  npmNote?: string;
}

export const technologySources = Object.freeze({
  react: { github: "react/react", npm: "react" },
  nextjs: { github: "vercel/next.js", npm: "next" },
  vue: { github: "vuejs/core", npm: "vue" },
  svelte: { github: "sveltejs/svelte", npm: "svelte" },
  angular: { github: "angular/angular", npm: "@angular/core" },
  nodejs: { github: "nodejs/node" },
  fastapi: { github: "fastapi/fastapi" },
  django: { github: "django/django" },
  go: { github: "golang/go" },
  postgresql: { github: "postgres/postgres" },
  mongodb: { github: "mongodb/mongo" },
  redis: { github: "redis/redis" },
  mysql: { github: "mysql/mysql-server" },
  pytorch: { github: "pytorch/pytorch" },
  tensorflow: {
    github: "tensorflow/tensorflow",
    npm: "@tensorflow/tfjs",
    npmNote: "TensorFlow.js is the JavaScript distribution of TensorFlow, not the Python package.",
  },
  jax: { github: "jax-ml/jax" },
  huggingface: {
    github: "huggingface/transformers",
    githubNote: "Transformers is a representative Hugging Face library, not the entire platform.",
  },
} satisfies Record<string, TechnologySource>);

export function hasTechnologySource(id: string): id is keyof typeof technologySources {
  return Object.prototype.hasOwnProperty.call(technologySources, id);
}
