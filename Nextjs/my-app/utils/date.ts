export const formatDate = (dateString?: string) => {
  if (!dateString) return "-";

  const [year, month, day] = dateString.split("-");

  return new Date(
    Number(year),
    Number(month) - 1,
    Number(day)
  ).toLocaleDateString("de-DE", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
};