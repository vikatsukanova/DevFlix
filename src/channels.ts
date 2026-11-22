export const channelTopics = ['All topics', 'AI & Agents', 'Frontend', 'Backend', 'System Design', 'DevOps'] as const;
export type ChannelTopic = typeof channelTopics[number];
export interface Channel { id: string; title: string; description: string; thumbnail?: string; uploadsId?: string; topics: ChannelTopic[] }
export const curatedChannels: Channel[] = [
  { id: 'UCsBjURrPoezykLs9EqgamOA', title: 'Fireship', description: 'Fast explanations of code, developer tools, and AI.', topics: ['Frontend', 'AI & Agents'] },
  { id: 'UCbRP3c757lWg9M-U7TyEkXA', title: 'Theo - t3.gg', description: 'React, TypeScript, and conversations about the modern web.', topics: ['Frontend'] },
  { id: 'UCZgt6AzoyjslHTC9dz0UoTw', title: 'ByteByteGo', description: 'Visual guides to system design and software architecture.', topics: ['System Design', 'Backend'] },
  { id: 'UC_ML5xP23TOWKUcc-oAE_Eg', title: 'Hussein Nasser', description: 'Explore databases, networking, and backend engineering.', topics: ['Backend', 'System Design'] },
  { id: 'UCs5Y5_7XK8HLDX0SLNwkd3w', title: 'Visual Studio Code', description: 'Developer tools, AI coding agents, and practical editor workflows.', topics: ['AI & Agents', 'Frontend'] },
  { id: 'UCUyeluBRhGPCW4rPe_UvBZQ', title: 'ThePrimeTime', description: 'Programming workflows, backend development, and developer tools.', topics: ['Backend'] },
  { id: 'UCWv7vMbMWH4-V0ZXdmDpPBA', title: 'Programming with Mosh', description: 'Structured lessons in frontend and backend development.', topics: ['Frontend', 'Backend'] },
  { id: 'UCdngmbVKX1Tgre699-XLlUA', title: 'TechWorld with Nana', description: 'DevOps, Kubernetes, containers, and cloud engineering.', topics: ['DevOps'] },
];
