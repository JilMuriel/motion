import { AxisBox2D, BoxDelta } from "../../../types/geometry"
import { MotionValue } from "../../../value"

export interface LayoutProps {
    /**
     * If `true`, this component will automatically animate to its new position when
     * its layout changes.
     *
     * ```jsx
     * <motion.div layout />
     * ```
     *
     * This will perform a layout animation using performant transforms. Part of this technique
     * involved animating an element's scale. This can introduce visual distortions on children,
     * `boxShadow` and `borderRadius`.
     *
     * To correct distortion on immediate children, add `layout` to those too.
     *
     * `boxShadow` and `borderRadius` will automatically be corrected if they are already being
     * animated on this component. Otherwise, set them directly via the `initial` prop.
     *
     * @public
     */
    layout?: boolean

    /**
     * Enable shared layout transitions between components for children of `AnimateSharedLayout`.
     *
     * When a component with a layoutId is removed from the React tree, and then
     * added elsewhere, it will visually animate from the previous component's bounding box
     * and its latest animated values.
     *
     * ```jsx
     * <AnimateSharedLayout>
     *   {items.map(item => (
     *      <motion.li layout>
     *         {item.name}
     *         {item.isSelected && <motion.div layoutId="underline" />}
     *      </motion.li>
     *   ))}
     * </AnimateSharedLayout>
     * ```
     *
     * If the previous component remains in the tree it will either get hidden immediately or,
     * if `type="crossfade"` is set on `AnimateSharedLayout`, it will crossfade to the new component.
     *
     * @public
     */
    layoutId?: string

    /**
     * A callback that will fire when a layout animation on this component completes.
     *
     * @public
     */
    onLayoutAnimationComplete?(): void

    /**
     * A callback that fires whenever the viewport-relative bounding box updates.
     *
     * @public
     */
    onViewportBoxUpdate?(box: AxisBox2D, delta: BoxDelta): void

    /**
     * A **readonly** MotionValue that will be updated with the latest x-axis delta
     * between a component's viewport box and its actual layout box.
     *
     * This will only be updated when using layout-aware props like `layout` and `drag`.
     *
     * ```jsx
     * function Component() {
     *   const layoutX = useMotionValue(0)
     *   const opacity = useTransform(layoutX, [-100, 0, 100], [0, 1, 0])
     *
     *   return (
     *     <motion.div
     *       drag="x"
     *       layoutX={layoutX}
     *       style={{ opacity }}
     *     />
     * }
     * ```
     *
     * @public
     */
    layoutX?: MotionValue<number>

    /**
     * A **readonly** MotionValue that will be updated with the latest x-axis delta
     * between a component's viewport box and its actual layout box.
     *
     * This will only be updated when using layout-aware props like `layout` and `drag`.
     *
     * ```jsx
     * function Component() {
     *   const layoutY = useMotionValue(0)
     *   const opacity = useTransform(layoutY, [-100, 0, 100], [0, 1, 0])
     *
     *   return (
     *     <motion.div
     *       drag="x"
     *       layoutY={layoutY}
     *       style={{ opacity }}
     *     />
     * }
     * ```
     *
     * @public
     */
    layoutY?: MotionValue<number>
}
