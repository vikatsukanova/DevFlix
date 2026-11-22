export type Category = 'All topics' | 'AI & ML' | 'Web development' | 'System design' | 'Backend' | 'DevOps';
export const categories: Category[] = ['All topics', 'AI & ML', 'Web development', 'System design', 'Backend', 'DevOps'];
export const rows = [
  { title: 'System Design Classics', subtitle: 'Big ideas. Beautifully explained.', playlistId: 'PLCRMIe5FDPsd0gVs500xeOewfySTsmEjf', category: 'System design' },
  { title: 'AI & Agents', subtitle: 'Build for what’s next.', playlistId: 'PLlrxD0HtieHgKcRjd5-8DT9TbwdlDO-OC', category: 'AI & ML' },
  { title: '100 Seconds of Code', subtitle: 'Small lessons. Serious knowledge. With Fireship.', playlistId: 'PL0vfts4VzfNiI1BsIK5u7LpPaIDKMJIDN', category: 'Web development' },
  { title: 'Backend Fundamentals', subtitle: 'Go deeper with Hussein Nasser.', playlistId: 'PLQnljOFTspQUNnO4p00ua_C5mKTfldiYT', category: 'Backend' },
  { title: 'Theo’s Developer Deep Dives', subtitle: 'Fresh perspectives on the modern web.', playlistId: 'UUbRP3c757lWg9M-U7TyEkXA', category: 'Web development' },
  { title: 'DevOps with Nana', subtitle: 'Containers, cloud, and the tools behind delivery.', playlistId: 'UUdngmbVKX1Tgre699-XLlUA', category: 'DevOps' },
] as const;
