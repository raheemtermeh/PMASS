export interface Subsystem {
  id: number;
  name: string;
  slug: string;
  status: string;
  load_percentage: number;
}

export interface SubsystemRepository {
  getAll(): Promise<Subsystem[]>;
}
