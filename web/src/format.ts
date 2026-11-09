import type { TaskStatus } from './api';

export const STATUS_LABELS: Record<TaskStatus, string> = {
  todo: 'Yapılacak',
  doing: 'Yapılıyor',
  done: 'Tamamlandı',
};

// Görev geçmişindeki alan adlarının Türkçe karşılıkları. Bilinmeyen alanlar olduğu gibi gösterilir.
const HISTORY_LABELS: Record<string, string> = {
  created: 'Görevi oluşturdu',
  deleted: 'Görevi sildi',
  owner: 'Sahibi değiştirdi',
  support: 'Destek oldu',
  title: 'Başlığı değiştirdi',
  status: 'Durumu değiştirdi',
  team_only: 'Görünürlüğü değiştirdi',
  needs_assignee: '"Kişi lazım" durumunu değiştirdi',
  description: 'Açıklamayı değiştirdi',
  due_date: 'Son tarihi değiştirdi',
};

export function historyLabel(field: string): string {
  return HISTORY_LABELS[field] ?? field;
}

const dateTimeFormatter = new Intl.DateTimeFormat('tr-TR', {
  timeZone: 'Europe/Istanbul',
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
});

export function formatDateTime(value: string): string {
  return dateTimeFormatter.format(new Date(value));
}
