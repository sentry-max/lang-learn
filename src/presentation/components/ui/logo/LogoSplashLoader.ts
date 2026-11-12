/**
 * <logo-splash-loader>: loading indicator concept 1, "Complete", for the splash screen.
 *
 * The ring draws itself clockwise, the progress piece slides into its slot, the
 * finished logo holds, fades out and the loop starts again. Call `finish()` when the
 * app is ready: the animation plays on until the logo is complete, holds it, then
 * resolves, so the splash never cuts away mid-animation.
 *
 * Self-contained: no dependencies, drawn with Canvas 2D and requestAnimationFrame.
 * Importing this file registers the element.
 *
 *   import './logo-splash-loader';
 *
 *   <logo-splash-loader size="160"></logo-splash-loader>
 *
 *   const splashLoader = document.querySelector('logo-splash-loader')!;
 *   await splashLoader.finish();   // then hide the splash screen
 *
 * Attributes:    size (pixels or any CSS length, default 48px), ring-color, piece-color,
 *                speed (multiplier, default 1), paused
 * CSS variables: --logo-loader-ring-color, --logo-loader-piece-color
 * Methods:       finish(holdMilliseconds = 250): Promise<void>, restart()
 * Event:         logo-splash-finished
 * Reduced motion: shows the complete logo without animating; finish() resolves after the hold.
 */

const TAG_NAME = 'logo-splash-loader';

const DEFAULT_RING_COLOR = '#45AAE3';
const DEFAULT_PIECE_COLOR = '#FFB72B';

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

// Timeline, as fractions of one cycle.
const CYCLE_DURATION_MILLISECONDS = 2400;
const RING_DRAW_END = 0.4;
const PIECE_SLIDE_START = 0.38;
const PIECE_SLIDE_END = 0.58;
const FADE_OUT_START = 0.82;
const FADE_OUT_END = 0.94;
const DEFAULT_FINISH_HOLD_MILLISECONDS = 250;

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

const easeStandardInOut = createCubicBezierEasing(0.65, 0, 0.35, 1);
const easeSnapWithOvershoot = createCubicBezierEasing(0.34, 1.56, 0.64, 1);
const easeIn = createCubicBezierEasing(0.42, 0, 1, 1);

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

function segmentProgress(time: number, segmentStart: number, segmentEnd: number): number {
  return clamp((time - segmentStart) / (segmentEnd - segmentStart), 0, 1);
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

interface PendingFinish {
  readonly holdMilliseconds: number;
  readonly promise: Promise<void>;
  readonly resolve: () => void;
}

export class LogoSplashLoader extends HTMLElementBase {
  static get observedAttributes(): string[] {
    return ['size', 'ring-color', 'piece-color', 'speed', 'paused'];
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
  private pendingFinish: PendingFinish | null = null;
  private isHoldingCompleteLogo = false;
  private finishTimeoutHandle: number | null = null;

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

  /**
   * Plays until the logo is complete, holds it for `holdMilliseconds`, then resolves and
   * fires `logo-splash-finished`. The complete logo stays on screen until you remove the
   * element or call `restart()`. Calling it again while waiting returns the same promise.
   */
  finish(holdMilliseconds: number = DEFAULT_FINISH_HOLD_MILLISECONDS): Promise<void> {
    if (this.pendingFinish !== null) {
      return this.pendingFinish.promise;
    }
    let resolvePromise: () => void = () => {};
    const promise = new Promise<void>((resolve) => {
      resolvePromise = resolve;
    });
    this.pendingFinish = { holdMilliseconds, promise, resolve: resolvePromise };
    this.requestRender();
    return promise;
  }

  /** Starts the animation again from its first frame. */
  restart(): void {
    this.isHoldingCompleteLogo = false;
    this.elapsedMilliseconds = 0;
    this.requestRender();
  }

  connectedCallback(): void {
    this.upgradeProperty('paused');
    this.upgradeProperty('speed');
    if (!this.hasAttribute('role')) {
      this.setAttribute('role', 'progressbar');
    }
    if (!this.hasAttribute('aria-label') && !this.hasAttribute('aria-labelledby')) {
      this.setAttribute('aria-label', 'Loading app');
    }
    this.applySizeAttribute();

    this.reducedMotionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    this.prefersReducedMotion = this.reducedMotionQuery.matches;
    this.reducedMotionQuery.addEventListener('change', this.handleReducedMotionChange);
    this.resizeObserver = new ResizeObserver(this.handleResize);
    this.resizeObserver.observe(this);
    this.intersectionObserver = new IntersectionObserver(this.handleIntersection);
    this.intersectionObserver.observe(this);

    this.refreshColors();
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
    if (this.finishTimeoutHandle !== null) {
      window.clearTimeout(this.finishTimeoutHandle);
      this.finishTimeoutHandle = null;
      this.settlePendingFinish();
    }
  }

  attributeChangedCallback(attributeName: string): void {
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

  private renderFrame(context: CanvasRenderingContext2D): void {
    if (this.prefersReducedMotion) {
      if (this.pendingFinish !== null) {
        this.isHoldingCompleteLogo = true;
      }
      this.drawFrame(context, PIECE_SLIDE_END);
      this.beginFinishHoldIfRequested();
      return;
    }
    let cycleTime = (this.elapsedMilliseconds % CYCLE_DURATION_MILLISECONDS) / CYCLE_DURATION_MILLISECONDS;
    if (this.isHoldingCompleteLogo) {
      cycleTime = PIECE_SLIDE_END;
    } else if (this.pendingFinish !== null && cycleTime >= PIECE_SLIDE_END && cycleTime < FADE_OUT_START) {
      this.isHoldingCompleteLogo = true;
      cycleTime = PIECE_SLIDE_END;
      this.beginFinishHoldIfRequested();
    }
    this.drawFrame(context, cycleTime);
  }

  private drawFrame(context: CanvasRenderingContext2D, cycleTime: number): void {
    const ringProgress = easeStandardInOut(segmentProgress(cycleTime, 0, RING_DRAW_END));
    const pieceArrival =
      cycleTime <= PIECE_SLIDE_START
        ? 0
        : easeSnapWithOvershoot(segmentProgress(cycleTime, PIECE_SLIDE_START, PIECE_SLIDE_END));
    const markOpacity = 1 - easeIn(segmentProgress(cycleTime, FADE_OUT_START, FADE_OUT_END));
    if (markOpacity <= 0) {
      return;
    }

    context.globalAlpha = markOpacity;
    fillAnnularSector(context, RING_START_ANGLE, RING_START_ANGLE + RING_SWEEP_ANGLE * ringProgress, this.ringColor);

    const pieceOpacity = clamp(pieceArrival, 0, 1) * markOpacity;
    if (pieceOpacity <= 0) {
      return;
    }
    const slideOffset = PIECE_SLIDE_DISTANCE * (1 - pieceArrival);
    context.globalAlpha = pieceOpacity;
    fillQuarterDisc(context, CENTER_X - PIECE_GAP - slideOffset, CENTER_Y + PIECE_GAP + slideOffset, this.pieceColor);
  }

  private beginFinishHoldIfRequested(): void {
    if (this.pendingFinish === null || this.finishTimeoutHandle !== null) {
      return;
    }
    this.finishTimeoutHandle = window.setTimeout(() => {
      this.finishTimeoutHandle = null;
      this.settlePendingFinish();
    }, this.pendingFinish.holdMilliseconds);
  }

  private settlePendingFinish(): void {
    const pendingFinish = this.pendingFinish;
    if (pendingFinish === null) {
      return;
    }
    this.pendingFinish = null;
    pendingFinish.resolve();
    this.dispatchEvent(new CustomEvent('logo-splash-finished', { bubbles: true, composed: true }));
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
    if (isRunning) {
      this.elapsedMilliseconds += frameDelta * this.speed;
    }
    if (timestamp - this.lastColorRefreshTimestamp > COLOR_REFRESH_INTERVAL_MILLISECONDS) {
      this.lastColorRefreshTimestamp = timestamp;
      this.refreshColors();
    }
    if (this.prepareCanvas()) {
      this.renderFrame(this.drawingContext);
      this.drawingContext.globalAlpha = 1;
    }

    const wantsAnotherFrame = !this.prefersReducedMotion && !this.isHoldingCompleteLogo;
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
  customElements.define(TAG_NAME, LogoSplashLoader);
}

declare global {
  interface HTMLElementTagNameMap {
    'logo-splash-loader': LogoSplashLoader;
  }
  interface HTMLElementEventMap {
    'logo-splash-finished': CustomEvent<void>;
  }
}
