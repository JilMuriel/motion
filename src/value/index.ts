import sync, { getFrameData, FrameData } from "framesync"
import { Action } from "popmotion"
import { velocityPerSecond } from "@popmotion/popcorn"
import { PopmotionTransitionProps } from "../types"

export type Transformer<T> = (v: T) => T

export type Subscriber<T> = (v: T) => void

export type Config<T> = {
    transformer?: Transformer<T>
    parent?: MotionValue<T>
}

export type ActionFactory = (actionConfig: PopmotionTransitionProps) => Action

export type StartAnimation = (complete: () => void) => () => void

const isFloat = (value: any): value is string => {
    return !isNaN(parseFloat(value))
}

/**
 * `MotionValue` is used to track the state and velocity of motion values.
 *
 * @public
 */
export class MotionValue<V = any> {
    /**
     * The current state of the `MotionValue`.
     *
     * @internal
     */
    private current: V

    /**
     * The previous state of the `MotionValue`.
     *
     * @internal
     */
    private prev: V

    /**
     * Duration, in milliseconds, since last updating frame.
     *
     * @internal
     */
    private timeDelta: number = 0

    /**
     * Timestamp of the last time this `MotionValue` was updated.
     *
     * @internal
     */
    private lastUpdated: number = 0

    /**
     * Collection of children `MotionValue`s to notify of updates.
     *
     * @internal
     */
    private children?: Set<MotionValue>

    /**
     * A reference to this `MotionValue`'s parent.
     *
     * @internal
     */
    private parent?: MotionValue

    /**
     * Functions to notify when the `MotionValue` updates.
     *
     * @internal
     */
    private updateSubscribers?: Set<Subscriber<V>>

    /**
     * Functions to notify when the `MotionValue` updates and `render` is set to `true`.
     *
     * @internal
     */
    private renderSubscribers?: Set<Subscriber<V>>

    /**
     * If defined, new values passed into `set` will be transformed through this function before being set.
     *
     * @internal
     */
    private transformer?: Transformer<V>

    /**
     * A reference to the currently-controlling Popmotion animation
     *
     * @internal
     */
    private stopAnimation?: null | (() => void)

    /**
     * Tracks whether this value can output a velocity. Currently this is only true
     * if the value is numerical, but we might be able to widen the scope here and support
     * other value types.
     *
     * @internal
     */
    private canTrackVelocity = false

    /**
     * @param init - The initiating value
     * @param config - Optional configuration options
     *
     * -  `transformer`: A function to transform incoming values with.
     *
     * @internal
     */
    constructor(init: V, { transformer, parent }: Config<V> = {}) {
        this.parent = parent
        this.transformer = transformer
        this.set(init, false)
        this.canTrackVelocity = isFloat(this.current)
    }

    /**
     * Creates a new `MotionValue` that's subscribed to the output of this one.
     *
     * @param config - Optional configuration options
     *
     * -  `transformer`: A function to transform incoming values with.
     *
     * @internal
     */
    addChild(config: Config<V>) {
        const child = new MotionValue(this.current, {
            parent: this,
            ...config,
        })

        if (!this.children) this.children = new Set()

        this.children.add(child)

        return child
    }

    /**
     * Stops a `MotionValue` from being subscribed to this one.
     *
     * @param child - The subscribed `MotionValue`
     *
     * @internal
     */
    removeChild(child: MotionValue) {
        if (!this.children) {
            return
        }
        this.children.delete(child)
    }

    /**
     * Subscribes a subscriber function to a subscription list.
     *
     * @param subscriptions - A `Set` of subscribers.
     * @param subscription - A subscriber function.
     */
    private subscribeTo(
        subscriptions: Set<Subscriber<V>>,
        subscription: Subscriber<V>
    ) {
        const updateSubscriber = () => subscription(this.current)
        subscriptions.add(updateSubscriber)
        return () => subscriptions.delete(updateSubscriber)
    }

    /**
     * Adds a function that will be notified when the `MotionValue` is updated.
     *
     * It returns a function that, when called, will cancel the subscription.
     *
     * When calling `onChange` inside a React component, it should be wrapped with the
     * `useEffect` hook. As it returns an unsubscribe function, this should be returned
     * from the `useEffect` function to ensure you don't add duplicate subscribers..
     *
     * @library
     *
     * ```jsx
     * function MyComponent() {
     *   const x = useMotionValue(0)
     *
     *   useEffect(() => {
     *     const unsubscribe = x.onChange((latestX) => {
     *       // Do stuff with latest x value
     *     })
     *
     *     return unsubscribe
     *   })
     *
     *   return <Frame x={x} />
     * }
     * ```
     *
     * @motion
     *
     * ```jsx
     * export const MyComponent = () => {
     *   const x = useMotionValue(0)
     *
     *   useEffect(() => {
     *     const unsubscribe = x.onChange((latestX) => {
     *       // Do stuff with latest x value
     *     })
     *
     *     return unsubscribe
     *   })
     *
     *   return <motion.div style={{ x }} />
     * }
     * ```
     *
     * @internalremarks
     *
     * We could look into a `useOnChange` hook if the above lifecycle management proves confusing.
     *
     * ```jsx
     * useOnChange(x, () => {})
     * ```
     *
     * @param subscriber - A function that receives the latest value.
     * @returns A function that, when called, will cancel this subscription.
     *
     * @public
     */
    onChange(subscription: Subscriber<V>): () => void {
        if (!this.updateSubscribers) this.updateSubscribers = new Set()
        return this.subscribeTo(this.updateSubscribers, subscription)
    }

    /**
     * Adds a function that will be notified when the `MotionValue` requests a render.
     *
     * @param subscriber - A function that's provided the latest value.
     * @returns A function that, when called, will cancel this subscription.
     *
     * @internal
     */
    onRenderRequest(subscription: Subscriber<V>) {
        if (!this.renderSubscribers) this.renderSubscribers = new Set()
        // Render immediately
        this.notifySubscriber(subscription)
        return this.subscribeTo(this.renderSubscribers, subscription)
    }

    /**
     * Sets the state of the `MotionValue`.
     *
     * @remarks
     *
     * ```jsx
     * const x = useMotionValue(0)
     * x.set(10)
     * ```
     *
     * @param latest - Latest value to set.
     * @param render - Whether to notify render subscribers. Defaults to `true`
     *
     * @public
     */
    set(v: V, render = true) {
        this.prev = this.current
        this.current = this.transformer ? this.transformer(v) : v

        if (this.updateSubscribers && this.prev !== this.current) {
            this.updateSubscribers.forEach(this.notifySubscriber)
        }

        if (this.children) {
            this.children.forEach(this.setChild)
        }

        if (render && this.renderSubscribers) {
            this.renderSubscribers.forEach(this.notifySubscriber)
        }

        // Update timestamp
        const { delta, timestamp } = getFrameData()

        if (this.lastUpdated !== timestamp) {
            this.timeDelta = delta
            this.lastUpdated = timestamp
            sync.postRender(this.scheduleVelocityCheck)
        }
    }

    /**
     * Returns the latest state of `MotionValue`
     *
     * @returns - The latest state of `MotionValue`
     *
     * @public
     */
    get() {
        return this.current
    }

    /**
     * Returns the latest velocity of `MotionValue`
     *
     * @returns - The latest velocity of `MotionValue`. Returns `0` if the state is non-numerical.
     *
     * @public
     */
    getVelocity() {
        // This could be isFloat(this.prev) && isFloat(this.current), but that would be wasteful
        return this.canTrackVelocity
            ? // These casts could be avoided if parseFloat would be typed better
              velocityPerSecond(
                  parseFloat(this.current as any) -
                      parseFloat(this.prev as any),
                  this.timeDelta
              )
            : 0
    }

    /**
     * Notify a subscriber with the latest value.
     *
     * This is an instanced and bound function to prevent generating a new
     * function once per frame.
     *
     * @param subscriber - The subscriber to notify.
     *
     * @internal
     */
    private notifySubscriber = (subscriber: Subscriber<V>) => {
        subscriber(this.current)
    }

    /**
     * Schedule a velocity check for the next frame.
     *
     * This is an instanced and bound function to prevent generating a new
     * function once per frame.
     *
     * @internal
     */
    private scheduleVelocityCheck = () => sync.postRender(this.velocityCheck)

    /**
     * Updates `prev` with `current` if the value hasn't been updated this frame.
     * This ensures velocity calculations return `0`.
     *
     * This is an instanced and bound function to prevent generating a new
     * function once per frame.
     *
     * @internal
     */
    private velocityCheck = ({ timestamp }: FrameData) => {
        if (timestamp !== this.lastUpdated) {
            this.prev = this.current
        }
    }

    /**
     * Updates child `MotionValue`.
     *
     * @param child - Child `MotionValue`.
     *
     * @internal
     */
    private setChild = (child: MotionValue) => child.set(this.current)

    /**
     * Registers a new animation to control this `MotionValue`. Only one
     * animation can drive a `MotionValue` at one time.
     *
     * ```jsx
     * value.start()
     * ```
     *
     * @param animation - A function that starts the provided animation
     *
     * @internal
     */
    start(animation: StartAnimation) {
        this.stop()

        return new Promise(resolve => {
            this.stopAnimation = animation(resolve)
        }).then(() => this.clearAnimation())
    }

    /**
     * Stop the currently active animation.
     *
     * @public
     */
    stop() {
        if (this.stopAnimation) this.stopAnimation()
        this.clearAnimation()
    }

    /**
     * Returns `true` if this value is currently animating.
     *
     * @public
     */
    isAnimating() {
        return !!this.stopAnimation
    }

    private clearAnimation() {
        this.stopAnimation = null
    }

    /**
     * Destroy and clean up subscribers to this `MotionValue`.
     *
     * The `MotionValue` hooks like `useMotionValue` and `useTransform` automatically
     * handle the lifecycle of the returned `MotionValue`, so this method is only necessary if you've manually
     * created a `MotionValue` via the `motionValue` function.
     *
     * @public
     */
    destroy() {
        this.updateSubscribers && this.updateSubscribers.clear()
        this.renderSubscribers && this.renderSubscribers.clear()
        this.parent && this.parent.removeChild(this)
        this.stop()
    }
}

/**
 * @internal
 */
export function motionValue<V>(init: V, opts?: Config<V>) {
    return new MotionValue<V>(init, opts)
}
