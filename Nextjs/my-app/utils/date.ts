// Helper-Funktion zur einheitlichen Datumsformatierung in der gesamten App.
// Erwartet ein ISO-artiges Datum im Format "YYYY-MM-DD" (z.B. aus <input type="date">
// oder aus der API) und gibt es lokalisiert im deutschen Format "TT.MM.JJJJ" zurück.
// Gibt "-" zurück, falls kein Datum übergeben wurde.
export const formatDate = (dateString?: string) => {
  if (!dateString) return "-";

  // Datum manuell zerlegen statt direkt "new Date(dateString)" zu nutzen, um
  // Zeitzonen-Verschiebungen bei reinen Datumsangaben (ohne Uhrzeit) zu vermeiden.
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