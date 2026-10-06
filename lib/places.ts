import { z } from "zod";
export const placesFilterSchema = z
  .object({
    minimum: z.number().min(0).max(5),
    maximum: z.number().min(0).max(5),
    minimumReviews: z.number().int().nonnegative(),
    maximumReviews: z.number().int().nonnegative().nullable(),
    phone: z.enum(["", "with", "without"]),
    website: z.enum(["", "with", "without"]),
  })
  .refine((f) => f.minimum <= f.maximum, {
    message: "A nota mínima não pode superar a máxima.",
  })
  .refine(
    (f) => f.maximumReviews === null || f.minimumReviews <= f.maximumReviews,
    { message: "O mínimo de avaliações não pode superar o máximo." },
  );
export type PlacesFilters = z.infer<typeof placesFilterSchema>;
export const initialPlacesFilters: PlacesFilters = {
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
  },
  f: PlacesFilters,
) {
  const restrictRating = f.minimum > 0 || f.maximum < 5;
  const restrictReviews = f.minimumReviews > 0 || f.maximumReviews !== null;
  return (
    (!restrictRating ||
      (p.rating !== undefined &&
        p.rating >= f.minimum &&
        p.rating <= f.maximum)) &&
    (!restrictReviews ||
      (p.userRatingCount !== undefined &&
        p.userRatingCount >= f.minimumReviews &&
        (f.maximumReviews === null ||
          p.userRatingCount <= f.maximumReviews))) &&
    (!f.phone ||
      (f.phone === "with"
        ? !!p.nationalPhoneNumber
        : !p.nationalPhoneNumber)) &&
    (!f.website || (f.website === "with" ? !!p.websiteUri : !p.websiteUri))
  );
}
