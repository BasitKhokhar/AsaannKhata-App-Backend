const CM_PER_INCH = 2.54;
const CM_PER_FOOT = 30.48;
const CM_PER_METER = 100;

function convertToCm(value, unit) {
  switch (unit) {
    case "inch":
      return value * CM_PER_INCH;
    case "feet":
      return value * CM_PER_FOOT;
    case "meter":
      return value * CM_PER_METER;
    case "cm":
    default:
      return value;
  }
}

function calculateAreaCm2(width, height, unit) {
  const widthCm = convertToCm(width, unit);
  const heightCm = convertToCm(height, unit);
  return widthCm * heightCm;
}

function getAreaConversionFactor(unit) {
  const oneUnitInCm = convertToCm(1, unit);
  return oneUnitInCm * oneUnitInCm; // sq cm per sq unit
}

function getLengthConversionFactor(unit) {
  return convertToCm(1, unit); // cm per unit — for LENGTH-mode price normalization
}

function convertToMl(value, unit) {
  return unit === 'liter' || unit === 'litre' ? value * 1000 : value;
}

function getVolumeConversionFactor(unit) {
  return unit === 'liter' || unit === 'litre' ? 1000 : 1;
}

module.exports = {
  convertToCm,
  calculateAreaCm2,
  getAreaConversionFactor,
  getLengthConversionFactor,
  convertToMl,
  getVolumeConversionFactor,
};
