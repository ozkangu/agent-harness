export interface PipelineTemplate {
  id: string;
  name: string;
  description: string;
  icon: string;
  category: "backend" | "frontend" | "fullstack" | "devops" | "data";
  tags: string[];
  difficulty: "beginner" | "intermediate" | "advanced";
  requirement: string;
}

export const PIPELINE_TEMPLATES: PipelineTemplate[] = [
  {
    id: "rest-api",
    name: "REST API",
    description: "Build a RESTful API with CRUD operations, validation, and error handling",
    icon: "Server",
    category: "backend",
    tags: ["api", "crud", "rest"],
    difficulty: "beginner",
    requirement:
      "Build a REST API with CRUD operations for managing resources. Include input validation, proper error handling with appropriate HTTP status codes, pagination support, and comprehensive API documentation.",
  },
  {
    id: "auth-system",
    name: "Authentication System",
    description: "Implement user authentication with login, register, password reset, and OAuth",
    icon: "Shield",
    category: "backend",
    tags: ["auth", "security", "oauth"],
    difficulty: "intermediate",
    requirement:
      "Implement a complete authentication system with user registration, login, password reset via email, JWT token management with refresh tokens, and OAuth2 integration with Google provider. Include rate limiting on auth endpoints and secure password hashing.",
  },
  {
    id: "chat-feature",
    name: "Real-time Chat",
    description: "Create a real-time chat feature with WebSocket support and message history",
    icon: "MessageSquare",
    category: "fullstack",
    tags: ["websocket", "realtime", "chat"],
    difficulty: "intermediate",
    requirement:
      "Create a real-time chat feature using WebSockets. Support private messages and group channels, message history with pagination, typing indicators, read receipts, and file/image sharing. Include user presence (online/offline) tracking.",
  },
  {
    id: "file-upload",
    name: "File Upload System",
    description: "Implement file upload with drag-and-drop, progress tracking, and cloud storage",
    icon: "Upload",
    category: "fullstack",
    tags: ["upload", "storage", "files"],
    difficulty: "beginner",
    requirement:
      "Implement a file upload system with drag-and-drop support, upload progress tracking, file type validation, size limits, and cloud storage integration (S3-compatible). Include image preview/thumbnail generation and a file management UI with search and filtering.",
  },
  {
    id: "dashboard",
    name: "Analytics Dashboard",
    description: "Build an analytics dashboard with charts, filters, and data export",
    icon: "BarChart3",
    category: "frontend",
    tags: ["dashboard", "charts", "analytics"],
    difficulty: "intermediate",
    requirement:
      "Build an analytics dashboard with interactive charts (line, bar, pie, area), date range filters, data aggregation options, real-time data updates, and CSV/PDF export. Include responsive layout with customizable widget grid and dark mode support.",
  },
  {
    id: "ecommerce",
    name: "E-commerce Backend",
    description: "Build product catalog, shopping cart, checkout, and order management",
    icon: "ShoppingCart",
    category: "fullstack",
    tags: ["ecommerce", "payments", "orders"],
    difficulty: "advanced",
    requirement:
      "Build an e-commerce backend with product catalog (categories, search, filters), shopping cart management, checkout flow with Stripe payment integration, order management with status tracking, inventory management, and email notifications for order updates.",
  },
  {
    id: "blog-cms",
    name: "Blog / CMS",
    description: "Create a content management system with markdown editor and categories",
    icon: "FileText",
    category: "fullstack",
    tags: ["cms", "blog", "content"],
    difficulty: "beginner",
    requirement:
      "Create a blog/CMS with markdown editor, post categories and tags, featured images, SEO metadata, draft/publish workflow, comment system with moderation, RSS feed generation, and sitemap. Include an admin panel for content management.",
  },
  {
    id: "mobile-backend",
    name: "Mobile App Backend",
    description: "Build a mobile-ready backend with push notifications and offline sync",
    icon: "Smartphone",
    category: "backend",
    tags: ["mobile", "push-notifications", "offline"],
    difficulty: "advanced",
    requirement:
      "Build a mobile-ready backend API with push notification support (FCM/APNs), offline data sync with conflict resolution, user profile management with avatar upload, device registration and management, and API versioning. Include rate limiting and request compression.",
  },
  {
    id: "cicd-setup",
    name: "CI/CD Pipeline Setup",
    description: "Configure CI/CD with testing, linting, building, and deployment stages",
    icon: "GitBranch",
    category: "devops",
    tags: ["ci-cd", "deployment", "automation"],
    difficulty: "intermediate",
    requirement:
      "Set up a CI/CD pipeline with automated testing (unit + integration), code linting and formatting checks, build optimization, Docker containerization, staging and production deployment with rollback support, and Slack/Discord notifications for pipeline status.",
  },
  {
    id: "db-migration",
    name: "Database Migration",
    description: "Plan and implement database schema migration with zero-downtime strategy",
    icon: "Database",
    category: "data",
    tags: ["database", "migration", "schema"],
    difficulty: "advanced",
    requirement:
      "Plan and implement a database migration strategy with zero-downtime schema changes, data transformation scripts, rollback procedures, migration version tracking, seed data management, and comprehensive testing. Support both SQL and NoSQL migration patterns.",
  },
];

export const TEMPLATE_CATEGORIES = [
  { key: "all" as const, label: "All" },
  { key: "backend" as const, label: "Backend" },
  { key: "frontend" as const, label: "Frontend" },
  { key: "fullstack" as const, label: "Full Stack" },
  { key: "devops" as const, label: "DevOps" },
  { key: "data" as const, label: "Data" },
];
