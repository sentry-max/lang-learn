/**
 * <logo-progress-indicator>: loading indicator concept 10, "Progress", driven by a real value.
 *
 * The ring fills over the first 75% of progress, the progress piece slides in over the
 * last 25% and snaps into its slot at 100%. Value changes are eased so jumps look smooth.
 *
 * Self-contained: no dependencies, drawn with Canvas 2D and requestAnimationFrame.
 * Importing this file registers the element.
 *
 *   import './logo-progress-indicator';
 *
 *   <logo-progress-indicator size="64" value="40" track></logo-progress-indicator>
 *
 *   const progressIndicator = document.querySelector('logo-progress-indicator')!;
 *   progressIndicator.value = 72;
 *   progressIndicator.addEventListener('logo-progress-complete', () => { ... });
 *
 * Attributes:    value (default 0), max (default 100), track (faint outline of the finished
 *                logo, so 0% is not an empty space), size (pixels or any CSS length, default
 *                48px), ring-color, piece-color, speed (multiplier for the easing), paused
 * CSS variables: --logo-loader-ring-color, --logo-loader-piece-color
 * Properties:    value, max, track, complete (read-only), paused, speed
 * Event:         logo-progress-complete, after the snap at 100%
 * Lowering the value after completion starts a fresh task from that value.
 * Reduced motion: values are drawn without easing and the snap is instant.
 */

const TAG_NAME = 'logo-progress-indicator';

const DEFAULT_RING_COLOR = '#45AAE3';
const DEFAULT_PIECE_COLOR = '#FFB72B';
const DEFAULT_MAXIMUM = 100;

// Geometry on the logo's 512 unit grid. The canvas shows the square from 56 to 456.
const VIEW_BOX_ORIGIN = 56;
const VIEW_BOX_SIZE = 400;
const RING_OUTER_RADIUS = 150;
const RING_INNER_RADIUS = 106;
const PIECE_GAP = 18;
const PIECE_SLIDE_DISTANCE = 56;
/** Ring center, nudged 9 up and 9 right so the whole mark looks centered. */
const CENTER_X = 265;
const CENTER_Y = 247;
/** The ring starts at 9 o'clock and runs clockwise for three quarters of a turn. */
const RING_START_ANGLE = Math.PI;
const RING_SWEEP_ANGLE = Math.PI * 1.5;

/** The ring fills over the first 75% of progress; the piece covers the last 25%. */
const RING_PORTION = 0.75;
/** Before 100% the piece waits this share of its slide distance away from the slot, then snaps in. */
const PIECE_WAITING_DISTANCE_RATIO = 0.3;
/** Time constant for easing the drawn value toward the real value. */
const VALUE_SMOOTHING_MILLISECONDS = 140;
const VALUE_SETTLE_THRESHOLD = 0.0005;
const COMPLETION_SNAP_DURATION_MILLISECONDS = 320;
const TRACK_OPACITY = 0.16;

/** Longest frame step allowed, so a frozen or background tab does not make the animation jump. */
const MAXIMUM_FRAME_DELTA_MILLISECONDS = 100;
/** How often the CSS variable colors are re-read, so theme switches are picked up. */
const COLOR_REFRESH_INTERVAL_MILLISECONDS = 500;

const SHADOW_STYLES = `
:host { display: inline-block; width: 48px; height: 48px; vertical-align: middle; contain: content; }
:host([hidden]) { display: none; }
canvas { display: block; width: 100%; height: 100%; object-fit: contain; }
`;

type EasingFunction = (progress: number) => number;

/** Equivalent of CSS cubic-bezier(); overshooting curves may return values above 1. */
function createCubicBezierEasing(
  firstControlX: number,
  firstControlY: number,
  secondControlX: number,
  secondControlY: number,
): EasingFunction {
  const coefficientCX = 3 * firstControlX;
  const coefficientBX = 3 * (secondControlX - firstControlX) - coefficientCX;
  const coefficientAX = 1 - coefficientCX - coefficientBX;
  const coefficientCY = 3 * firstControlY;
  const coefficientBY = 3 * (secondControlY - firstControlY) - coefficientCY;
  const coefficientAY = 1 - coefficientCY - coefficientBY;
  const sampleCurveX = (parameter: number): number =>
    ((coefficientAX * parameter + coefficientBX) * parameter + coefficientCX) * parameter;
  const sampleCurveY = (parameter: number): number =>
    ((coefficientAY * parameter + coefficientBY) * parameter + coefficientCY) * parameter;
  const sampleCurveDerivativeX = (parameter: number): number =>
    (3 * coefficientAX * parameter + 2 * coefficientBX) * parameter + coefficientCX;

  const solveCurveX = (targetX: number): number => {
    let parameter = targetX;
    for (let iteration = 0; iteration < 8; iteration += 1) {
      const error = sampleCurveX(parameter) - targetX;
      if (Math.abs(error) < 1e-6) {
        return parameter;
      }
      const derivative = sampleCurveDerivativeX(parameter);
      if (Math.abs(derivative) < 1e-6) {
        break;
      }
      parameter -= error / derivative;
    }
    let lowerBound = 0;
    let upperBound = 1;
    parameter = targetX;
    for (let iteration = 0; iteration < 32; iteration += 1) {
      const sampledX = sampleCurveX(parameter);
      if (Math.abs(sampledX - targetX) < 1e-6) {
        return parameter;
      }
      if (targetX > sampledX) {
        lowerBound = parameter;
      } else {
        upperBound = parameter;
      }
      parameter = (lowerBound + upperBound) / 2;
    }
    return parameter;
  };

  return (progress: number): number => {
    if (progress <= 0) {
      return 0;
    }
    if (progress >= 1) {
      return 1;
    }
    return sampleCurveY(solveCurveX(progress));
  };
}

const easeSnapWithOvershoot = createCubicBezierEasing(0.34, 1.56, 0.64, 1);

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

/** Fills part of the ring between two angles (clockwise from 3 o'clock), with radial cut ends. */
function fillAnnularSector(
  context: CanvasRenderingContext2D,
  startAngle: number,
  endAngle: number,
  color: string,
): void {
  if (endAngle - startAngle <= 0.0001) {
    return;
  }
  context.beginPath();
  context.arc(CENTER_X, CENTER_Y, RING_OUTER_RADIUS, startAngle, endAngle, false);
  context.arc(CENTER_X, CENTER_Y, RING_INNER_RADIUS, endAngle, startAngle, true);
  context.closePath();
  context.fillStyle = color;
  context.fill();
}

/** Fills the progress piece: a quarter disc in the lower left quadrant with its square corner at the given point. */
function fillQuarterDisc(context: CanvasRenderingContext2D, cornerX: number, cornerY: number, color: string): void {
  context.beginPath();
  context.moveTo(cornerX, cornerY);
  context.lineTo(cornerX - RING_OUTER_RADIUS, cornerY);
  context.arc(cornerX, cornerY, RING_OUTER_RADIUS, Math.PI, Math.PI / 2, true);
  context.closePath();
  context.fillStyle = color;
  context.fill();
}

/** Lets the file be imported during server-side rendering, where HTMLElement does not exist. */
const HTMLElementBase: typeof HTMLElement =
  typeof HTMLElement === 'undefined' ? (class {} as unknown as typeof HTMLElement) : HTMLElement;

export class LogoProgressIndicator extends HTMLElementBase {
  static get observedAttributes(): string[] {
    return ['value', 'max', 'track', 'size', 'ring-color', 'piece-color', 'speed', 'paused'];
  }

  private readonly canvasElement: HTMLCanvasElement;
  private readonly drawingContext: CanvasRenderingContext2D;
  private ringColor = DEFAULT_RING_COLOR;
  private pieceColor = DEFAULT_PIECE_COLOR;
  private prefersReducedMotion = false;
  private elapsedMilliseconds = 0;
  private animationFrameHandle: number | null = null;
  private previousFrameTimestamp: number | null = null;
  private lastColorRefreshTimestamp = Number.NEGATIVE_INFINITY;
  private cssPixelWidth = 0;
  private cssPixelHeight = 0;
  private isOnScreen = true;
  private isSizeAppliedFromAttribute = false;
  private resizeObserver: ResizeObserver | null = null;
  private intersectionObserver: IntersectionObserver | null = null;
  private reducedMotionQuery: MediaQueryList | null = null;
  private maximum = DEFAULT_MAXIMUM;
  private targetFraction = 0;
  private displayedFraction = 0;
  private completionSnapStartMilliseconds: number | null = null;
  private isComplete = false;

  constructor() {
    super();
    const shadowRoot = this.attachShadow({ mode: 'open' });
    const styleElement = document.createElement('style');
    styleElement.textContent = SHADOW_STYLES;
    this.canvasElement = document.createElement('canvas');
    this.canvasElement.setAttribute('aria-hidden', 'true');
    shadowRoot.append(styleElement, this.canvasElement);
    const context = this.canvasElement.getContext('2d');
    if (context === null) {
      throw new Error('Canvas 2D rendering is not available in this browser.');
    }
    this.drawingContext = context;
  }

  get value(): number {
    return this.targetFraction * this.maximum;
  }

  set value(newValue: number) {
    this.setAttribute('value', String(newValue));
  }

  get max(): number {
    return this.maximum;
  }

  set max(newMaximum: number) {
    this.setAttribute('max', String(newMaximum));
  }

  get track(): boolean {
    return this.hasAttribute('track');
  }

  set track(isTrackVisible: boolean) {
    this.toggleAttribute('track', Boolean(isTrackVisible));
  }

  /** True once the value has reached the maximum and the piece has snapped into place. */
  get complete(): boolean {
    return this.isComplete;
  }

  get paused(): boolean {
    return this.hasAttribute('paused');
  }

  set paused(isPaused: boolean) {
    this.toggleAttribute('paused', Boolean(isPaused));
  }

  get speed(): number {
    const speedAttribute = Number.parseFloat(this.getAttribute('speed') ?? '');
    return Number.isFinite(speedAttribute) && speedAttribute > 0 ? speedAttribute : 1;
  }

  set speed(speedMultiplier: number) {
    this.setAttribute('speed', String(speedMultiplier));
  }

  connectedCallback(): void {
    for (const propertyName of ['value', 'max', 'track', 'paused', 'speed']) {
      this.upgradeProperty(propertyName);
    }
    if (!this.hasAttribute('role')) {
      this.setAttribute('role', 'progressbar');
    }
    if (!this.hasAttribute('aria-label') && !this.hasAttribute('aria-labelledby')) {
      this.setAttribute('aria-label', 'Progress');
    }
    this.setAttribute('aria-valuemin', '0');
    this.setAttribute('aria-valuemax', '100');
    this.applySizeAttribute();

    this.reducedMotionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    this.prefersReducedMotion = this.reducedMotionQuery.matches;
    this.reducedMotionQuery.addEventListener('change', this.handleReducedMotionChange);
    this.resizeObserver = new ResizeObserver(this.handleResize);
    this.resizeObserver.observe(this);
    this.intersectionObserver = new IntersectionObserver(this.handleIntersection);
    this.intersectionObserver.observe(this);

    this.refreshColors();
    this.updateTargetFromAttributes();
    this.requestRender();
  }

  disconnectedCallback(): void {
    if (this.animationFrameHandle !== null) {
      cancelAnimationFrame(this.animationFrameHandle);
      this.animationFrameHandle = null;
    }
    this.previousFrameTimestamp = null;
    this.resizeObserver?.disconnect();
    this.resizeObserver = null;
    this.intersectionObserver?.disconnect();
    this.intersectionObserver = null;
    this.reducedMotionQuery?.removeEventListener('change', this.handleReducedMotionChange);
    this.reducedMotionQuery = null;
  }

  attributeChangedCallback(attributeName: string): void {
    if (attributeName === 'value' || attributeName === 'max') {
      this.updateTargetFromAttributes();
      return;
    }
    if (!this.isConnected) {
      return;
    }
    if (attributeName === 'size') {
      this.applySizeAttribute();
    }
    if (attributeName === 'ring-color' || attributeName === 'piece-color') {
      this.refreshColors();
    }
    this.requestRender();
  }

  private renderFrame(context: CanvasRenderingContext2D, frameDeltaMilliseconds: number): void {
    this.advanceDisplayedValue(frameDeltaMilliseconds);

    if (this.track) {
      context.globalAlpha = TRACK_OPACITY;
      fillAnnularSector(context, RING_START_ANGLE, RING_START_ANGLE + RING_SWEEP_ANGLE, this.ringColor);
      fillQuarterDisc(context, CENTER_X - PIECE_GAP, CENTER_Y + PIECE_GAP, this.pieceColor);
      context.globalAlpha = 1;
    }

    const fraction = this.displayedFraction;
    const ringProgress = Math.min(fraction / RING_PORTION, 1);
    fillAnnularSector(context, RING_START_ANGLE, RING_START_ANGLE + RING_SWEEP_ANGLE * ringProgress, this.ringColor);

    if (fraction <= RING_PORTION && !this.isComplete) {
      return;
    }

    const waitingDistance = PIECE_SLIDE_DISTANCE * PIECE_WAITING_DISTANCE_RATIO;
    let slideOffset: number;
    let pieceOpacity: number;
    if (this.isComplete) {
      slideOffset = 0;
      pieceOpacity = 1;
    } else if (this.completionSnapStartMilliseconds !== null) {
      const snapProgress = clamp(
        (this.elapsedMilliseconds - this.completionSnapStartMilliseconds) / COMPLETION_SNAP_DURATION_MILLISECONDS,
        0,
        1,
      );
      slideOffset = waitingDistance * (1 - easeSnapWithOvershoot(snapProgress));
      pieceOpacity = 1;
    } else {
      const pieceProgress = (fraction - RING_PORTION) / (1 - RING_PORTION);
      slideOffset = PIECE_SLIDE_DISTANCE - (PIECE_SLIDE_DISTANCE - waitingDistance) * pieceProgress;
      pieceOpacity = Math.min(1, pieceProgress * 2.5);
    }

    if (pieceOpacity <= 0) {
      return;
    }
    context.globalAlpha = pieceOpacity;
    fillQuarterDisc(context, CENTER_X - PIECE_GAP - slideOffset, CENTER_Y + PIECE_GAP + slideOffset, this.pieceColor);
    context.globalAlpha = 1;
  }

  private updateTargetFromAttributes(): void {
    const maximumAttribute = Number.parseFloat(this.getAttribute('max') ?? '');
    this.maximum = Number.isFinite(maximumAttribute) && maximumAttribute > 0 ? maximumAttribute : DEFAULT_MAXIMUM;
    const valueAttribute = Number.parseFloat(this.getAttribute('value') ?? '');
    const nextTargetFraction = Number.isFinite(valueAttribute) ? clamp(valueAttribute / this.maximum, 0, 1) : 0;

    const hasStartedCompleting = this.isComplete || this.completionSnapStartMilliseconds !== null;
    if (hasStartedCompleting && nextTargetFraction < 1) {
      this.isComplete = false;
      this.completionSnapStartMilliseconds = null;
      this.displayedFraction = nextTargetFraction;
    }
    this.targetFraction = nextTargetFraction;

    if (this.isConnected) {
      this.setAttribute('aria-valuenow', String(Math.round(nextTargetFraction * 100)));
      this.requestRender();
    }
  }

  private advanceDisplayedValue(frameDeltaMilliseconds: number): void {
    if (this.prefersReducedMotion) {
      this.displayedFraction = this.targetFraction;
    } else if (this.displayedFraction !== this.targetFraction) {
      const smoothing = 1 - Math.exp(-frameDeltaMilliseconds / VALUE_SMOOTHING_MILLISECONDS);
      this.displayedFraction += (this.targetFraction - this.displayedFraction) * smoothing;
      if (Math.abs(this.targetFraction - this.displayedFraction) < VALUE_SETTLE_THRESHOLD) {
        this.displayedFraction = this.targetFraction;
      }
    }

    if (this.displayedFraction >= 1 && !this.isComplete && this.completionSnapStartMilliseconds === null) {
      if (this.prefersReducedMotion) {
        this.markComplete();
      } else {
        this.completionSnapStartMilliseconds = this.elapsedMilliseconds;
      }
    }

    if (
      this.completionSnapStartMilliseconds !== null &&
      this.elapsedMilliseconds - this.completionSnapStartMilliseconds >= COMPLETION_SNAP_DURATION_MILLISECONDS
    ) {
      this.completionSnapStartMilliseconds = null;
      this.markComplete();
    }
  }

  private markComplete(): void {
    this.isComplete = true;
    this.dispatchEvent(new CustomEvent('logo-progress-complete', { bubbles: true, composed: true }));
  }

  private requestRender(): void {
    if (!this.isConnected || this.animationFrameHandle !== null) {
      return;
    }
    this.animationFrameHandle = requestAnimationFrame(this.handleAnimationFrame);
  }

  private readonly handleAnimationFrame = (timestamp: number): void => {
    this.animationFrameHandle = null;
    const frameDelta =
      this.previousFrameTimestamp === null
        ? 0
        : Math.min(timestamp - this.previousFrameTimestamp, MAXIMUM_FRAME_DELTA_MILLISECONDS);
    this.previousFrameTimestamp = timestamp;

    const isRunning = this.isConnected && this.isOnScreen && !this.paused;
    const scaledFrameDelta = isRunning ? frameDelta * this.speed : 0;
    this.elapsedMilliseconds += scaledFrameDelta;
    if (timestamp - this.lastColorRefreshTimestamp > COLOR_REFRESH_INTERVAL_MILLISECONDS) {
      this.lastColorRefreshTimestamp = timestamp;
      this.refreshColors();
    }
    if (this.prepareCanvas()) {
      this.renderFrame(this.drawingContext, scaledFrameDelta);
    }

    // Only keeps animating while the drawn value is catching up or the completion snap is playing.
    const wantsAnotherFrame =
      this.displayedFraction !== this.targetFraction || this.completionSnapStartMilliseconds !== null;
    if (isRunning && wantsAnotherFrame) {
      this.animationFrameHandle = requestAnimationFrame(this.handleAnimationFrame);
    } else {
      this.previousFrameTimestamp = null;
    }
  };

  /** Matches the canvas to the element size and screen density, clears it and sets the design scale. */
  private prepareCanvas(): boolean {
    const cssSize = Math.min(this.cssPixelWidth, this.cssPixelHeight);
    if (cssSize <= 0) {
      return false;
    }
    const pixelSize = Math.max(1, Math.round(cssSize * (window.devicePixelRatio || 1)));
    if (this.canvasElement.width !== pixelSize || this.canvasElement.height !== pixelSize) {
      this.canvasElement.width = pixelSize;
      this.canvasElement.height = pixelSize;
    }
    const context = this.drawingContext;
    const designScale = pixelSize / VIEW_BOX_SIZE;
    context.setTransform(1, 0, 0, 1, 0, 0);
    context.globalAlpha = 1;
    context.clearRect(0, 0, pixelSize, pixelSize);
    context.setTransform(designScale, 0, 0, designScale, -VIEW_BOX_ORIGIN * designScale, -VIEW_BOX_ORIGIN * designScale);
    return true;
  }

  private refreshColors(): void {
    if (!this.isConnected) {
      return;
    }
    const computedStyle = getComputedStyle(this);
    const nextRingColor =
      this.getAttribute('ring-color')?.trim() ||
      computedStyle.getPropertyValue('--logo-loader-ring-color').trim() ||
      DEFAULT_RING_COLOR;
    const nextPieceColor =
      this.getAttribute('piece-color')?.trim() ||
      computedStyle.getPropertyValue('--logo-loader-piece-color').trim() ||
      DEFAULT_PIECE_COLOR;
    if (nextRingColor !== this.ringColor || nextPieceColor !== this.pieceColor) {
      this.ringColor = nextRingColor;
      this.pieceColor = nextPieceColor;
      this.requestRender();
    }
  }

  private applySizeAttribute(): void {
    const sizeAttribute = this.getAttribute('size')?.trim() ?? '';
    if (sizeAttribute === '') {
      if (this.isSizeAppliedFromAttribute) {
        this.style.removeProperty('width');
        this.style.removeProperty('height');
        this.isSizeAppliedFromAttribute = false;
      }
      return;
    }
    const cssLength = /^\d+(\.\d+)?$/.test(sizeAttribute) ? `${sizeAttribute}px` : sizeAttribute;
    this.style.width = cssLength;
    this.style.height = cssLength;
    this.isSizeAppliedFromAttribute = true;
  }

  /** Re-applies a property set before the element was upgraded (for example by a framework). */
  private upgradeProperty(propertyName: string): void {
    if (Object.prototype.hasOwnProperty.call(this, propertyName)) {
      const instance = this as unknown as Record<string, unknown>;
      const pendingValue = instance[propertyName];
      delete instance[propertyName];
      instance[propertyName] = pendingValue;
    }
  }

  private readonly handleResize = (entries: ResizeObserverEntry[]): void => {
    const latestEntry = entries[entries.length - 1];
    if (latestEntry === undefined) {
      return;
    }
    this.cssPixelWidth = latestEntry.contentRect.width;
    this.cssPixelHeight = latestEntry.contentRect.height;
    this.requestRender();
  };

  private readonly handleIntersection = (entries: IntersectionObserverEntry[]): void => {
    const latestEntry = entries[entries.length - 1];
    if (latestEntry === undefined) {
      return;
    }
    this.isOnScreen = latestEntry.isIntersecting;
    if (this.isOnScreen) {
      this.requestRender();
    }
  };

  private readonly handleReducedMotionChange = (event: MediaQueryListEvent): void => {
    this.prefersReducedMotion = event.matches;
    this.requestRender();
  };
}

if (typeof customElements !== 'undefined' && customElements.get(TAG_NAME) === undefined) {
  customElements.define(TAG_NAME, LogoProgressIndicator);
}

declare global {
  interface HTMLElementTagNameMap {
    'logo-progress-indicator': LogoProgressIndicator;
  }
  interface HTMLElementEventMap {
    'logo-progress-complete': CustomEvent<void>;
  }
}
