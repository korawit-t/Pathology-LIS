import { formatPatientName } from "./patientName";

describe("formatPatientName", () => {
  it("joins title, name, and last name", () => {
    expect(
      formatPatientName({ title: { title: "Mr." }, name: "Somchai", ln: "Jaidee" }),
    ).toBe("Mr. Somchai Jaidee");
  });

  it("skips missing parts", () => {
    expect(formatPatientName({ name: "Somchai" })).toBe("Somchai");
  });

  it("falls back to '-' when nothing is present", () => {
    expect(formatPatientName(undefined)).toBe("-");
    expect(formatPatientName(null)).toBe("-");
    expect(formatPatientName({})).toBe("-");
  });
});
