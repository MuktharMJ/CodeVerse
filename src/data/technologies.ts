export type Category = "Web" | "Backend" | "Database" | "AI";
export type CategoryFilter = Category | "All";

export interface Technology {
  id: string;
  name: string;
  category: Category;
  description: string;
  detail: string;
  position: [number, number, number];
  size: number;
  symbol: string;
}

export const categories: Record<Category, { color: string; label: string; subtitle: string }> = {
  Web: { color: "#62d5ff", label: "Web", subtitle: "Interfaces & experiences" },
  Backend: { color: "#85e5b0", label: "Backend", subtitle: "Logic & infrastructure" },
  Database: { color: "#ffc479", label: "Database", subtitle: "Data & persistence" },
  AI: { color: "#b79aff", label: "AI & ML", subtitle: "Intelligence & discovery" },
};

export const technologies: Technology[] = [
  { id: "react", name: "React", category: "Web", description: "The library for web and native user interfaces.", detail: "Compose interactive experiences from small, reusable components. A gravitational center of the modern web ecosystem.", position: [-3.8, 1.4, 1.5], size: 0.55, symbol: "react" },
  { id: "nextjs", name: "Next.js", category: "Web", description: "The React framework for the web.", detail: "Bring React applications to production with server rendering, file-based routing, and full-stack capabilities.", position: [-1.25, 3.0, -0.1], size: 0.38, symbol: "N" },
  { id: "vue", name: "Vue", category: "Web", description: "The progressive JavaScript framework.", detail: "An approachable, versatile framework for building reactive interfaces, from a small enhancement to a complete application.", position: [-6.7, 3.1, -1.7], size: 0.34, symbol: "V" },
  { id: "svelte", name: "Svelte", category: "Web", description: "A compiler-first approach to building interfaces.", detail: "Move work from the browser to the build step, turning expressive components into lean, targeted JavaScript.", position: [-7.4, -0.1, 0.5], size: 0.29, symbol: "S" },
  { id: "angular", name: "Angular", category: "Web", description: "A platform for ambitious web applications.", detail: "A comprehensive framework with dependency injection, powerful templates, and first-class tools for large applications.", position: [-5.9, -2.4, -1.0], size: 0.3, symbol: "A" },
  { id: "nodejs", name: "Node.js", category: "Backend", description: "JavaScript, beyond the browser.", detail: "An event-driven JavaScript runtime that connects the frontend ecosystem to fast, scalable servers and developer tooling.", position: [-0.5, 0.1, 1.6], size: 0.49, symbol: "JS" },
  { id: "fastapi", name: "FastAPI", category: "Backend", description: "High-performance APIs, powered by Python.", detail: "Build typed Python APIs with automatic documentation, asynchronous execution, and a natural connection to machine learning.", position: [2.4, -0.65, 0.7], size: 0.34, symbol: "bolt" },
  { id: "django", name: "Django", category: "Backend", description: "The web framework for perfectionists with deadlines.", detail: "A batteries-included Python framework with a rich ORM and mature tools for building robust web applications.", position: [0.5, -2.7, -0.5], size: 0.3, symbol: "dj" },
  { id: "go", name: "Go", category: "Backend", description: "Simple, reliable, and efficient software.", detail: "A compiled language with lightweight concurrency, well suited to cloud infrastructure, network services, and backend systems.", position: [3.4, -3.35, -2.0], size: 0.29, symbol: "GO" },
  { id: "postgresql", name: "PostgreSQL", category: "Database", description: "The world's most advanced open source relational database.", detail: "A powerful, extensible SQL database trusted for data integrity, complex queries, and applications of every scale.", position: [-2.0, -3.8, 1.0], size: 0.43, symbol: "database" },
  { id: "mongodb", name: "MongoDB", category: "Database", description: "A flexible document database for modern applications.", detail: "Store JSON-like documents with a flexible schema and query them using a rich, expressive document model.", position: [-4.9, -4.4, -1.2], size: 0.29, symbol: "leaf" },
  { id: "redis", name: "Redis", category: "Database", description: "The real-time, in-memory data store.", detail: "Low-latency data structures power caches, queues, sessions, and real-time applications across the software universe.", position: [1.15, -4.65, -1.8], size: 0.28, symbol: "stack" },
  { id: "mysql", name: "MySQL", category: "Database", description: "An enduring foundation for relational data.", detail: "A widely adopted relational database that brings proven SQL storage to applications, services, and content platforms.", position: [-0.3, -5.8, -3.5], size: 0.25, symbol: "my" },
  { id: "pytorch", name: "PyTorch", category: "AI", description: "From research to production, with open source machine learning.", detail: "A flexible deep learning framework with dynamic computation graphs, GPU acceleration, and a thriving research community.", position: [5.1, 2.2, 0.7], size: 0.49, symbol: "pytorch" },
  { id: "tensorflow", name: "TensorFlow", category: "AI", description: "An end-to-end platform for machine learning.", detail: "Build, train, and deploy machine learning models across servers, browsers, mobile devices, and embedded systems.", position: [7.9, 0.1, -1.5], size: 0.35, symbol: "TF" },
  { id: "jax", name: "JAX", category: "AI", description: "Accelerated computing with composable transformations.", detail: "Combine NumPy-style code with automatic differentiation and just-in-time compilation for high-performance numerical research.", position: [7.65, 3.8, -2.0], size: 0.29, symbol: "JAX" },
  { id: "huggingface", name: "Hugging Face", category: "AI", description: "The community building the future of AI.", detail: "An open ecosystem of models, datasets, and libraries connecting machine learning researchers and builders around the world.", position: [3.0, 4.45, -2.1], size: 0.33, symbol: "face" },
];

// These links describe ecosystem relationships, not a dependency graph.
export const connections: ReadonlyArray<readonly [string, string]> = [
  ["react", "nextjs"], ["react", "nodejs"], ["vue", "nodejs"],
  ["svelte", "nodejs"], ["angular", "nodejs"], ["nextjs", "nodejs"],
  ["react", "vue"], ["react", "svelte"], ["react", "angular"],
  ["nodejs", "postgresql"], ["nodejs", "mongodb"], ["nodejs", "redis"],
  ["nodejs", "mysql"], ["nextjs", "postgresql"], ["fastapi", "postgresql"],
  ["django", "postgresql"], ["django", "mysql"], ["django", "redis"],
  ["go", "postgresql"], ["go", "redis"], ["fastapi", "redis"],
  ["fastapi", "pytorch"], ["fastapi", "tensorflow"], ["fastapi", "huggingface"],
  ["pytorch", "huggingface"], ["tensorflow", "huggingface"],
  ["jax", "huggingface"], ["pytorch", "jax"], ["pytorch", "tensorflow"],
];

export const technologyById = Object.fromEntries(technologies.map((technology) => [technology.id, technology])) as Record<string, Technology>;

export function getConnectedIds(id: string): string[] {
  return connections.flatMap(([source, target]) => source === id ? [target] : target === id ? [source] : []);
}
