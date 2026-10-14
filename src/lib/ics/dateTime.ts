export function formatLocalDateTime(date: string, time: string): string {
  const [year, month, day] = date.split("-");
  const [hour, minute, second = "00"] = time.split(":");
  return `${year}${month}${day}T${hour}${minute}${second}`;
}
