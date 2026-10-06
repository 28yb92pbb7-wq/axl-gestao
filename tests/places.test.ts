import test from "node:test";
import assert from "node:assert/strict";
import {
  initialPlacesFilters as defaults,
  matchesPlace,
  placesFilterSchema,
} from "../lib/places";
test("nota e avaliações usam limites inclusivos combinados", () => {
  const f = {
    ...defaults,
    minimum: 4,
    maximum: 4.8,
    minimumReviews: 10,
    maximumReviews: 50,
  };
  assert.equal(matchesPlace({ rating: 4.8, userRatingCount: 50 }, f), true);
  assert.equal(matchesPlace({ rating: 4.9, userRatingCount: 20 }, f), false);
  assert.equal(matchesPlace({ rating: 4.5, userRatingCount: 51 }, f), false);
});
test("dados desconhecidos não viram zero nos filtros restritivos", () => {
  assert.equal(matchesPlace({}, defaults), true);
  assert.equal(matchesPlace({}, { ...defaults, minimum: 4 }), false);
  assert.equal(
    matchesPlace({ rating: 4.5 }, { ...defaults, maximumReviews: 0 }),
    false,
  );
  assert.equal(
    matchesPlace({ userRatingCount: 0 }, { ...defaults, maximumReviews: 0 }),
    true,
  );
});
test("limites de nota e avaliação precisam estar em ordem", () => {
  assert.equal(
    placesFilterSchema.safeParse({ ...defaults, minimum: 5, maximum: 4 })
      .success,
    false,
  );
  assert.equal(
    placesFilterSchema.safeParse({
      ...defaults,
      minimumReviews: 20,
      maximumReviews: 10,
    }).success,
    false,
  );
  assert.equal(
    placesFilterSchema.safeParse({ ...defaults, minimumReviews: 1.5 }).success,
    false,
  );
});
test("nota, telefone e site podem ser combinados", () => {
  const f = {
    ...defaults,
    minimum: 4,
    phone: "with" as const,
    website: "without" as const,
  };
  assert.equal(
    matchesPlace(
      {
        rating: 4.5,
        nationalPhoneNumber: "(19) 0000-0000",
        queried: ["website"],
      },
      f,
    ),
    true,
  );
  assert.equal(matchesPlace({ rating: 4.5 }, f), false);
  assert.equal(
    matchesPlace(
      {
        rating: 4.5,
        nationalPhoneNumber: "19",
        websiteUri: "https://example.com",
      },
      f,
    ),
    false,
  );
});
test("comparações precisas de avaliações preservam fronteiras e desconhecido", () => {
  for (const n of [0, 19, 20, 21, 100, 101]) {
    assert.equal(
      matchesPlace(
        { userRatingCount: n },
        { ...defaults, reviewMode: "lt", minimumReviews: 20 },
      ),
      n < 20,
    );
    assert.equal(
      matchesPlace(
        { userRatingCount: n },
        { ...defaults, reviewMode: "range", minimumReviews: 20 },
      ),
      n >= 20,
    );
    assert.equal(
      matchesPlace(
        { userRatingCount: n },
        { ...defaults, reviewMode: "gt", minimumReviews: 100 },
      ),
      n > 100,
    );
    assert.equal(
      matchesPlace(
        { userRatingCount: n },
        { ...defaults, reviewMode: "eq", minimumReviews: 20 },
      ),
      n === 20,
    );
  }
  assert.equal(
    matchesPlace({}, { ...defaults, reviewMode: "eq", minimumReviews: 0 }),
    false,
  );
  assert.equal(matchesPlace({}, { ...defaults, reviewMode: "unknown" }), true);
});
test("nota exata 4.8 não arredonda para 5 e campo não consultado não vira ausência", () => {
  assert.equal(
    matchesPlace(
      { rating: 4.8 },
      { ...defaults, ratingMode: "eq", minimum: 4.8 },
    ),
    true,
  );
  assert.equal(
    matchesPlace(
      { rating: 5 },
      { ...defaults, ratingMode: "eq", minimum: 4.8 },
    ),
    false,
  );
  assert.equal(matchesPlace({}, { ...defaults, website: "without" }), false);
  assert.equal(
    matchesPlace({ queried: ["website"] }, { ...defaults, website: "without" }),
    true,
  );
  assert.equal(matchesPlace({}, { ...defaults, website: "unknown" }), true);
  assert.equal(
    matchesPlace({ queried: ["website"] }, { ...defaults, website: "unknown" }),
    false,
  );
});
