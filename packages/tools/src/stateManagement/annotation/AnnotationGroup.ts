import { eventTarget, triggerEvent } from '@cornerstonejs/core';
import Events from '../../enums/Events';
import { getAnnotation } from './annotationState';

export type BaseEventDetail = {
  viewportId: string;
  renderingEngineId: string;
};

/**
 * An annotation group
 */

export default class AnnotationGroup {
  private annotationUIDs = new Set<string>();
  private _isVisible = true;
  private _isActive = true;

  public visibleFilter: (uid: string) => boolean;
  protected addAnnotationListener: (evt) => void;

  constructor() {
    this.visibleFilter = this.unboundVisibleFilter.bind(this);
    this.addAnnotationListener = this.unboundAddAnnotationListener.bind(this);
  }

  /**
   * Returns true if other groups are free to hide this annotation.
   * That is, if the annotation is not a member or is hidden.
   */
  protected unboundVisibleFilter(uid: string): boolean {
    return !this._isVisible || !this.annotationUIDs.has(uid);
  }

  /**
   * Event handler for adding new items to this group
   * Does NOT add modified entries.
   */
  protected unboundAddAnnotationListener(evt) {
    if (!this._isActive) {
      return;
    }
    const { annotationUID } = evt.detail.annotation || evt.detail;
    this.annotationUIDs.add(annotationUID);
  }

  public has(uid: string): boolean {
    return this.annotationUIDs.has(uid);
  }
  /**
   * Sets whether annotations belonging to this group are visible or not.
   * If there are multiple groups, then the set visible false should be called
   * before before re-enabling the other groups with setVisible true.
   */
  public setVisible(
    isVisible = true,
    baseEvent: BaseEventDetail,
    filter?: (annotationUID: string) => boolean
  ) {
    if (this._isVisible === isVisible) {
      return;
    }
    this._isVisible = isVisible;
    this.annotationUIDs.forEach((uid) => {
      const annotation = getAnnotation(uid);
      if (!annotation) {
        this.annotationUIDs.delete(uid);
        return;
      }
      if (annotation.isVisible === isVisible) {
        return;
      }
      if (!isVisible && filter?.(uid) === false) {
        return;
      }
      annotation.isVisible = isVisible;
      const eventDetail = {
        ...baseEvent,
        annotation,
      };
      triggerEvent(eventTarget, Events.ANNOTATION_MODIFIED, eventDetail);
    });
  }

  public get isVisible() {
    return this._isVisible;
  }

  public get isActive() {
    return this._isActive;
  }

  /** Finds the nearby/next annotation in the given direction */
  public findNearby(uid: string, direction: 1) {
    if (!this._isVisible) {
      return null;
    }
    const uids = [...this.annotationUIDs];
    if (uids.length === 0) {
      return null;
    }
    if (!uid) {
      return uids[direction === 1 ? 0 : uids.length - 1];
    }
    const index = uids.indexOf(uid);
    if (
      index === -1 ||
      index + direction < 0 ||
      index + direction > uids.length
    ) {
      return null;
    }
    return uids[index + direction];
  }

  /**
   * The active group is the group that gets automatically added to when annotations
   * are added or removed.
   * It is possible for multiple groups to be active, in which case each one will
   * get added to on new or modified views.
   * @param active
   */
  public setActive(active = true) {
    this._isActive = active;
  }

  /**
   * Adds the annotation to the group
   * Does NOT change the visibility status of the annotation.
   */
  public add(annotationUID: string) {
    this.annotationUIDs.add(annotationUID);
  }

  /**
   * Removes the annotation from the group.
   * Does not affect the visibility status of the annotation.
   */
  public remove(annotationUID: string) {
    this.annotationUIDs.delete(annotationUID);
  }

  /**
   * Adds listeners to automatically add/remove from this group when the group
   * is active.
   */
  public addListeners() {
    eventTarget.addEventListener(
      Events.ANNOTATION_ADDED,
      this.addAnnotationListener
    );
  }

  /**
   * Removes listeners that add to this group on creating a new instance.
   */
  public removeListeners() {
    eventTarget.removeEventListener(
      Events.ANNOTATION_ADDED,
      this.addAnnotationListener
    );
  }
}
