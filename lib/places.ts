import { z } from "zod";
export const placesFilterSchema = z
  .object({
    ratingMode: z.enum(["range", "eq", "unknown"]).default("range"),
    reviewMode: z.enum(["range", "lt", "gt", "eq", "unknown"]).default("range"),
    hours: z.enum(["", "with", "without", "unknown"]).default(""),
    minimum: z.number().min(0).max(5),
    maximum: z.number().min(0).max(5),
    minimumReviews: z.number().int().nonnegative(),
    maximumReviews: z.number().int().nonnegative().nullable(),
    phone: z.enum(["", "with", "without", "unknown"]),
    website: z.enum(["", "with", "without", "unknown"]),
  })
  .refine((f) => f.ratingMode !== "range" || f.minimum <= f.maximum, {
    message: "A nota mínima não pode superar a máxima.",
  })
  .refine(
    (f) =>
      f.reviewMode !== "range" ||
      f.maximumReviews === null ||
      f.minimumReviews <= f.maximumReviews,
    { message: "O mínimo de avaliações não pode superar o máximo." },
  );
export type PlacesFilters = z.infer<typeof placesFilterSchema>;
export const initialPlacesFilters: PlacesFilters = {
  ratingMode: "range",
  reviewMode: "range",
  hours: "",
  minimum: 0,
  maximum: 5,
  minimumReviews: 0,
  maximumReviews: null,
  phone: "",
  website: "",
};
export function matchesPlace(
  p: {
    rating?: number;
    userRatingCount?: number;
    nationalPhoneNumber?: string;
    websiteUri?: string;
    regularOpeningHours?: unknown;
    queried?: string[];
  },
  f: PlacesFilters,
) {
  const restrictRating = f.minimum > 0 || f.maximum < 5;
  const restrictReviews = f.minimumReviews > 0 || f.maximumReviews !== null;
  const presence = (field: string, value: unknown, filter: string) =>
    !filter ||
    (filter === "with"
      ? Boolean(value)
      : filter === "without"
        ? p.queried?.includes(field) === true && !value
        : !value && !p.queried?.includes(field));
  const rating =
    f.ratingMode === "unknown"
      ? p.rating === undefined
      : f.ratingMode === "eq"
        ? p.rating === f.minimum
        : !restrictRating ||
          (p.rating !== undefined &&
            p.rating >= f.minimum &&
            p.rating <= f.maximum);
  const count = p.userRatingCount;
  const reviews =
    f.reviewMode === "unknown"
      ? count === undefined
      : f.reviewMode === "lt"
        ? count !== undefined && count < f.minimumReviews
        : f.reviewMode === "gt"
          ? count !== undefined && count > f.minimumReviews
          : f.reviewMode === "eq"
            ? count === f.minimumReviews
            : !restrictReviews ||
              (count !== undefined &&
                count >= f.minimumReviews &&
                (f.maximumReviews === null || count <= f.maximumReviews));
  return (
    rating &&
    reviews &&
    presence("phone", p.nationalPhoneNumber, f.phone) &&
    presence("website", p.websiteUri, f.website) &&
    presence("hours", p.regularOpeningHours, f.hours)
  );
}
