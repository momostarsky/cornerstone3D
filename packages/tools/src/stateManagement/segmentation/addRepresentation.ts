import { utilities } from '@cornerstonejs/core';
import type { Types } from '@cornerstonejs/core';
import {
  SegmentationRepresentationConfig,
  RepresentationPublicInput,
  RepresentationPublicInputOptions,
  SegmentationRepresentation,
} from '../../types/SegmentationStateTypes';
import * as SegmentationState from './segmentationState';
import { getRepresentationRenderingConfig } from './helpers/getRepresentationRenderingConfig';
import CORNERSTONE_COLOR_LUT from '../../constants/COLOR_LUT';
import { triggerAnnotationRenderForViewportIds } from '../../utilities';
import { SegmentationRepresentations } from '../../enums';
import { triggerSegmentationModified } from './triggerSegmentationEvents';

async function addRepresentation(
  viewportId: string,
  representationInput: RepresentationPublicInput,
  segmentationRepresentationConfig?: SegmentationRepresentationConfig
): Promise<string> {
  const { segmentationId, options = {} as RepresentationPublicInputOptions } =
    representationInput;

  const segmentationRepresentationUID =
    representationInput.options?.segmentationRepresentationUID ||
    utilities.uuidv4();

  const colorLUTIndexToUse = getColorLUTIndex(options);

  const representation: SegmentationRepresentation = {
    segmentationId,
    segmentationRepresentationUID,
    type: representationInput.type,
    colorLUTIndex: colorLUTIndexToUse,
    rendering: getRepresentationRenderingConfig(representationInput),
    polySeg: options.polySeg,
    config: {
      allSegments: {},
      perSegment: {},
    },
  };

  // Update the toolGroup specific configuration
  if (segmentationRepresentationConfig) {
    // Since setting configuration on toolGroup will trigger a segmentationRepresentation
    // update event, we don't want to trigger the event twice, so we suppress
    // the first one
    // const currentToolGroupConfig =
    //   SegmentationConfig.getToolGroupSpecificConfig(toolGroupId);
    // const mergedConfig = utilities.deepMerge(
    //   currentToolGroupConfig,
    //   toolGroupSpecificConfig
    // // );
    // SegmentationConfig.setToolGroupSpecificConfig(toolGroupId, {
    //   renderInactiveRepresentations:
    //     mergedConfig.renderInactiveRepresentations || true,
    //   representations: {
    //     ...mergedConfig.representations,
    //   },
    // });
  }

  SegmentationState.addRepresentationToViewport(viewportId, representation);
  if (representationInput.type === SegmentationRepresentations.Contour) {
    triggerAnnotationRenderForViewportIds([viewportId]);
  }

  triggerSegmentationModified(segmentationId);

  return segmentationRepresentationUID;
}

function getColorLUTIndex(options = {} as RepresentationPublicInputOptions) {
  const colorLUTOrIndexInput = options.colorLUTOrIndex;
  let colorLUTIndexToUse;

  if (typeof colorLUTOrIndexInput === 'number') {
    colorLUTIndexToUse = colorLUTOrIndexInput;
  } else {
    const nextIndex = SegmentationState.getNextColorLUTIndex();
    const colorLUTToAdd = Array.isArray(colorLUTOrIndexInput)
      ? colorLUTOrIndexInput
      : CORNERSTONE_COLOR_LUT;
    SegmentationState.addColorLUT(colorLUTToAdd as Types.ColorLUT, nextIndex);
    colorLUTIndexToUse = nextIndex;
  }
  return colorLUTIndexToUse;
}

export { addRepresentation };