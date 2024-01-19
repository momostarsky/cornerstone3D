import { utilities as csUtils } from '@cornerstonejs/core';
import type { Types } from '@cornerstonejs/core';
import {
  AnnotationCompletedEventType,
  AnnotationModifiedEventType,
  AnnotationRemovedEventType,
} from '../../../types/EventTypes';
import { state as annotationState } from '../../../stateManagement/annotation';
import getInterpolationDataCollection from '../../contours/interpolation/getInterpolationDataCollection';
import type { InterpolationViewportData } from '../../../types/InterpolationTypes';
import interpolate from '../../contours/interpolation/interpolate';
import updateRelatedAnnotations from './updateRelatedAnnotations';
import deleteRelatedAnnotations from './deleteRelatedAnnotations';
import { InterpolationROIAnnotation } from '../../../types/ToolSpecificAnnotationTypes';
import ChangeTypes from '../../../enums/ChangeTypes';
import getMatchingViewport from '../../getMatchingViewport';

const { uuidv4 } = csUtils;

export default class InterpolationManager {
  static toolNames = [];

  static addTool(toolName: string) {
    if (-1 === this.toolNames.indexOf(toolName)) {
      this.toolNames.push(toolName);
    }
  }

  /**
   * Accepts the autogenerated interpolations, marking them as non-autogenerated.
   * Can provide a selector to choose which ones to accept
   */
  static acceptAutoGenerated(
    annotationGroupSelector,
    selector: {
      toolNames?: string[];
      segmentationRepresentationUID?: string;
      segmentIndex?: number;
    } = {}
  ) {
    const { toolNames, segmentationRepresentationUID, segmentIndex } = selector;
    for (const toolName of toolNames || InterpolationManager.toolNames) {
      const annotations = annotationState.getAnnotations(
        toolName,
        annotationGroupSelector
      );
      if (!annotations?.length) {
        continue;
      }
      for (const annotation of annotations) {
        const { data, autoGenerated } = annotation;
        if (!autoGenerated) {
          continue;
        }
        if (segmentIndex && segmentIndex !== data.segmentation.segmentIndex) {
          continue;
        }
        if (
          segmentationRepresentationUID &&
          segmentationRepresentationUID !==
            data.segmentation.segmentationRepresentationUID
        ) {
          continue;
        }
        annotation.autoGenerated = false;
      }
    }
  }

  static handleAnnotationCompleted = (evt: AnnotationCompletedEventType) => {
    const annotation = evt.detail.annotation as InterpolationROIAnnotation;
    if (!annotation?.metadata) {
      return;
    }
    const { toolName } = annotation.metadata;

    if (-1 === this.toolNames.indexOf(toolName)) {
      return;
    }

    const viewport = getMatchingViewport(annotation);
    if (!viewport) {
      console.warn('Unable to find viewport for', viewport);
      return;
    }
    const sliceData: Types.ImageSliceData = getSliceData(viewport);
    const viewportData: InterpolationViewportData = {
      viewport,
      sliceData,
      annotation,
      interpolationUID: annotation.interpolationUID,
    };
    const isInitializeLabel = !annotation.interpolationUID;
    // If any update, triggered on an annotation, then it will be treated as non-autogenerated.
    annotation.autoGenerated = false;
    if (!isInitializeLabel) {
      updateRelatedAnnotations(viewportData, true);
    }
    if (annotation.interpolationUID) {
      return;
    }
    const filterData = [
      {
        key: 'segmentIndex',
        value: annotation.data.segmentation.segmentIndex,
        parentKey: (annotation) => annotation.data.segmentation,
      },
      {
        key: 'viewPlaneNormal',
        value: annotation.metadata.viewPlaneNormal,
        parentKey: (annotation) => annotation.metadata,
      },
      {
        key: 'viewUp',
        value: annotation.metadata.viewUp,
        parentKey: (annotation) => annotation.metadata,
      },
    ];
    let interpolationAnnotations = getInterpolationDataCollection(
      viewportData,
      filterData,
      true
    );
    // Skip other type of annotations with same location
    interpolationAnnotations = interpolationAnnotations.filter(
      (interpolationAnnotation) => interpolationAnnotation.interpolationUID
    );
    if (!annotation.interpolationUID) {
      annotation.interpolationUID =
        interpolationAnnotations[0]?.interpolationUID || uuidv4();
      viewportData.interpolationUID = annotation.interpolationUID;
    }
    interpolate(viewportData);
  };

  static handleAnnotationUpdate = (evt: AnnotationModifiedEventType) => {
    const annotation = evt.detail.annotation as InterpolationROIAnnotation;
    const { changeType = ChangeTypes.HandlesUpdated } = evt.detail;
    if (!annotation?.metadata) {
      return;
    }
    const { toolName } = annotation.metadata;

    if (
      -1 === this.toolNames.indexOf(toolName) ||
      changeType !== ChangeTypes.HandlesUpdated
    ) {
      return;
    }

    const viewport = getMatchingViewport(annotation);
    if (!viewport) {
      console.warn(
        'Unable to find matching viewport for annotation interpolation',
        annotation
      );
      return;
    }

    const sliceData: Types.ImageSliceData = getSliceData(viewport);
    const viewportData: InterpolationViewportData = {
      viewport,
      sliceData,
      annotation,
      interpolationUID: annotation.interpolationUID,
    };
    updateRelatedAnnotations(viewportData, false);
  };

  static handleAnnotationDelete = (evt: AnnotationRemovedEventType) => {
    const annotation = evt.detail.annotation as InterpolationROIAnnotation;
    if (!annotation?.metadata) {
      return;
    }
    const { toolName } = annotation.metadata;

    if (-1 === this.toolNames.indexOf(toolName) || annotation.autoGenerated) {
      return;
    }
    const viewport = getMatchingViewport(annotation);

    if (!viewport) {
      console.warn(
        "No viewport, can't delete interpolated results",
        annotation
      );
      return;
    }

    const sliceData: Types.ImageSliceData = getSliceData(viewport);
    const viewportData: InterpolationViewportData = {
      viewport,
      sliceData,
      annotation,
      interpolationUID: annotation.interpolationUID,
    };
    // If any update, triggered on an annotation, then it will be treated as non-interpolated.
    annotation.autoGenerated = false;
    deleteRelatedAnnotations(viewportData);
  };
}

function getSliceData(viewport): Types.ImageSliceData {
  const sliceData: Types.ImageSliceData = {
    numberOfSlices: viewport.getNumberOfSlices(),
    imageIndex: viewport.getCurrentImageIdIndex(),
  };
  return sliceData;
}
