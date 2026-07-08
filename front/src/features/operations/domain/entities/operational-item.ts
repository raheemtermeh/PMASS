export interface OperationalItemDto {
  id: number;
  ticket_code: string;
  title: string;
  description: string | null;
  type: string;
  severity: string;
  status: string;
  origin_subsystem_id: number | null;
  assigned_to: string | null;
  linked_pr: string | null;
  created_at: string;
  completed_at: string | null;
}

export interface OperationsRepository {
  getItems(): Promise<OperationalItemDto[]>;
  resolveBlocker(ticketCode: string): Promise<void>;
}
