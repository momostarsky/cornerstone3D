import { Enums } from '@cornerstonejs/core';

const { CalibrationTypes } = Enums;
const PIXEL_UNITS = 'px';

const SUPPORTED_REGION_DATA_TYPES = [
  1, // Tissue
];

const SUPPORTED_LENGTH_UNITS = [
  3, // cm
];

const SUPPORTED_OTHER_UNITS = [
  4, // seconds
];

const UNIT_MAPPING = {
  3: 'cm',
  4: 'seconds',
};

/**
 * Extracts the length units and the type of calibration for those units
 * into the response.  The length units will typically be either mm or px
 * while the calibration type can be any of a number of different calibration types.
 *
 * Volumetric images have no calibration type, so are just the raw mm.
 *
 * TODO: Handle region calibration
 *
 * @param handles - used to detect if the spacing information is different
 *   between various points (eg angled ERMF or US Region).
 *   Currently unused, but needed for correct US Region handling
 * @param image - to extract the calibration from
 *        image.calibration - calibration value to extract units form
 * @returns String containing the units and type of calibration
 */
const getCalibratedLengthUnits = (handles, image): string => {
  const { calibration, hasPixelSpacing } = image;
  // Anachronistic - moving to using calibration consistently, but not completed yet
  const units = hasPixelSpacing ? 'mm' : PIXEL_UNITS;
  if (
    !calibration ||
    (!calibration.type && !calibration.sequenceOfUltrasoundRegions)
  ) {
    return units;
  }
  if (calibration.type === CalibrationTypes.UNCALIBRATED) {
    return PIXEL_UNITS;
  }
  if (calibration.sequenceOfUltrasoundRegions) {
    return 'US Region';
  }
  return `${units} ${calibration.type}`;
};

const SQUARE = '\xb2';
/**
 *  Extracts the area units, including the squared sign plus calibration type.
 */
const getCalibratedAreaUnits = (handles, image): string => {
  const { calibration, hasPixelSpacing } = image;
  const units = (hasPixelSpacing ? 'mm' : PIXEL_UNITS) + SQUARE;
  if (!calibration || !calibration.type) {
    return units;
  }
  if (calibration.sequenceOfUltrasoundRegions) {
    return 'US Region';
  }
  return `${units} ${calibration.type}`;
};

/**
 * Gets the scale divisor for converting from internal spacing to
 * image spacing for calibrated images.
 */
const getCalibratedScale = (image, handles) => {
  if (image.calibration.sequenceOfUltrasoundRegions) {
    // image.spacing / image.us.space
  } else if (image.calibration.scale) {
    return image.calibration.scale;
  } else {
    return 1;
  }
};

/**
 * Extracts the calibrated length units, area units, and the scale
 * for converting from internal spacing to image spacing.
 *
 * @param handles - to detect if spacing information is different between points
 * @param image - to extract the calibration from
 * @returns Object containing the units, area units, and scale
 */
const getCalibratedLengthUnitsAndScale = (image, handles) => {
  const [imageIndex1, imageIndex2] = handles;
  const { calibration, hasPixelSpacing } = image;
  let units = hasPixelSpacing ? 'mm' : PIXEL_UNITS;
  const areaUnits = units + SQUARE;
  let scale = 1;
  let calibrationType = '';

  if (
    !calibration ||
    (!calibration.type && !calibration.sequenceOfUltrasoundRegions)
  ) {
    return { units, areaUnits, scale };
  }

  if (calibration.type === CalibrationTypes.UNCALIBRATED) {
    return { units: PIXEL_UNITS, areaUnits: PIXEL_UNITS + SQUARE, scale };
  }

  if (calibration.sequenceOfUltrasoundRegions) {
    const supportedRegionsMetadata =
      calibration.sequenceOfUltrasoundRegions.filter(
        (region) =>
          SUPPORTED_REGION_DATA_TYPES.includes(region.regionDataType) &&
          SUPPORTED_LENGTH_UNITS.includes(region.physicalUnitXDirection) &&
          SUPPORTED_LENGTH_UNITS.includes(region.physicalUnitYDirection)
      );

    if (!supportedRegionsMetadata.length) {
      return { units, areaUnits, scale };
    }

    const region = supportedRegionsMetadata.find(
      (region) =>
        imageIndex1[0] >= region.regionLocationMinX0 &&
        imageIndex1[0] <= region.regionLocationMaxX1 &&
        imageIndex1[1] >= region.regionLocationMinY0 &&
        imageIndex1[1] <= region.regionLocationMaxY1 &&
        imageIndex2[0] >= region.regionLocationMinX0 &&
        imageIndex2[0] <= region.regionLocationMaxX1 &&
        imageIndex2[1] >= region.regionLocationMinY0 &&
        imageIndex2[1] <= region.regionLocationMaxY1
    );

    if (region) {
      scale = 1 / (region.physicalDeltaX * region.physicalDeltaY * 100);
      calibrationType = 'US Region';
      units = 'mm';
    }
  } else if (calibration.scale) {
    scale = calibration.scale;
  }

  return {
    units: units + (calibrationType ? ` ${calibrationType}` : ''),
    areaUnits: areaUnits + (calibrationType ? ` ${calibrationType}` : ''),
    scale,
  };
};

const getCalibratedProbeUnitsAndValue = (image, handles) => {
  const [imageIndex] = handles;
  const { calibration } = image;
  let units = ['raw'];
  let value = null;
  let calibrationType = '';

  if (
    !calibration ||
    (!calibration.type && !calibration.sequenceOfUltrasoundRegions)
  ) {
    return { units, value };
  }

  if (calibration.sequenceOfUltrasoundRegions) {
    const supportedRegionsMetadata =
      calibration.sequenceOfUltrasoundRegions.filter(
        (region) =>
          SUPPORTED_REGION_DATA_TYPES.includes(region.regionDataType) &&
          SUPPORTED_OTHER_UNITS.includes(region.physicalUnitXDirection) &&
          SUPPORTED_LENGTH_UNITS.includes(region.physicalUnitYDirection)
      );

    if (!supportedRegionsMetadata.length) {
      return { units, value };
    }

    const region = supportedRegionsMetadata.find(
      (region) =>
        imageIndex[0] >= region.regionLocationMinX0 &&
        imageIndex[0] <= region.regionLocationMaxX1 &&
        imageIndex[1] >= region.regionLocationMinY0 &&
        imageIndex[1] <= region.regionLocationMaxY1
    );

    if (region) {
      const { referencePixelX0 = 0, referencePixelY0 = 0 } = region;
      const { physicalDeltaX, physicalDeltaY } = region;

      const yValue =
        (imageIndex[1] - region.regionLocationMinY0 - referencePixelY0) *
        physicalDeltaY;

      const xValue =
        (imageIndex[0] - region.regionLocationMinX0 - referencePixelX0) *
        physicalDeltaX;

      value = [xValue, yValue];
      calibrationType = 'US Region';
      units = [
        UNIT_MAPPING[region.physicalUnitXDirection],
        UNIT_MAPPING[region.physicalUnitYDirection],
      ];
    }
  }

  return {
    units: units + (calibrationType ? ` ${calibrationType}` : ''),
    value,
  };
};

/** Gets the aspect ratio of the screen display relative to the image
 * display in order to square up measurement values.
 * That is, suppose the spacing on the image is 1, 0.5 (x,y spacing)
 * This is displayed at 1, 1 spacing on screen, then the
 * aspect value will be 1/0.5 = 2
 */
const getCalibratedAspect = (image) => image.calibration?.aspect || 1;

export default getCalibratedLengthUnits;

export {
  getCalibratedAreaUnits,
  getCalibratedLengthUnits,
  getCalibratedLengthUnitsAndScale,
  getCalibratedScale,
  getCalibratedAspect,
  getCalibratedProbeUnitsAndValue,
};
