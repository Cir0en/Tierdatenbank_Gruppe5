import Link from "next/link";

export default function Register() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-zinc-50">
      <div className="p-8 rounded-xl bg-white shadow">
        <h1 className="text-2xl font-semibold mb-4">Register page</h1>
        <p className="mb-4">Diese Seite ist vorerst ein Platzhalter, damit der Next.js-Build erfolgreich ist.</p>
        <Link href="/" className="text-blue-600 hover:underline">
          Zurück zur Startseite
        </Link>
      </div>
    </div>
  );
}
