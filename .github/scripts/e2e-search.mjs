// A course search the way the app makes one: the catalog URL from .env, the
// newest term, a subject code. Passes when the staging catalog answers with
// at least one course. Run with `node --env-file=.env`.
const base = (process.env.NEXT_PUBLIC_CATALOG_URL ?? "").replace(/\/+$/, "");
if (!base) throw new Error("NEXT_PUBLIC_CATALOG_URL is not set in .env.");

async function get(path) {
  const response = await fetch(`${base}${path}`, {
    headers: { "x-client": "dogdays-e2e/1" },
  });
  if (!response.ok) {
    throw new Error(`GET ${path} returned ${response.status}.`);
  }
  return response.json();
}

const { terms } = await get("/terms");
if (!Array.isArray(terms) || terms.length === 0) {
  throw new Error("The catalog lists no terms.");
}
const term = terms[0].academicPeriod;
const body = await get(`/search?term=${term}&q=CSCI&limit=5`);
const results = body.results ?? body.courses ?? [];
if (results.length === 0) {
  throw new Error(`Searching "CSCI" in term ${term} found no courses.`);
}
console.log(`Searched "CSCI" in term ${term}: ${results.length} courses.`);
