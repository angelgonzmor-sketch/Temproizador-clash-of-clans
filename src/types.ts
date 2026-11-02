export interface Timer {
  id: string;
  name: string;
  level?: number;
  nextLevel?: number;
  endTime: number;
  duration: number;
  icon: string;
  category: string;
  sourceId?: number;
}

export interface Potion {
  active: boolean;
  endTime: number;
}
