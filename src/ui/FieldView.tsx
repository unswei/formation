import { useRef, useState } from 'react'
import type { PointerEvent as ReactPointerEvent } from 'react'

import {
  BALL_RADIUS_METRES,
  ROBOT_RADIUS_METRES,
  clampPointToField,
  getFieldGeometry,
  getViewportBounds,
  sampleArc,
} from '../geom/field'
import type { FieldDimensions } from '../geom/field'
import {
  createViewTransform,
  screenToWorld,
  transformToSvgMatrix,
  worldToScreen,
} from '../geom/transform'
import { useElementSize } from '../hooks/useElementSize'
import type { RobotId, Vec2 } from '../types'

type RenderRobot = {
  id: RobotId
  position: Vec2
  known: boolean
}

type FieldViewProps = {
  dimensions: FieldDimensions
  ball: Vec2
  robots: RenderRobot[]
  showPlayerIds: boolean
  onBallChange: (ball: Vec2) => void
}

export function FieldView({
  dimensions,
  ball,
  robots,
  showPlayerIds,
  onBallChange,
}: FieldViewProps) {
  const frameRef = useRef<HTMLDivElement | null>(null)
  const svgRef = useRef<SVGSVGElement | null>(null)
  const activePointerId = useRef<number | null>(null)
  const { width, height } = useElementSize(frameRef)
  const [hoverPosition, setHoverPosition] = useState<Vec2 | null>(null)

  const geometry = getFieldGeometry(dimensions)
  const transform = createViewTransform(
    getViewportBounds(dimensions),
    width || 960,
    height || 640,
  )

  const updateFromPointer = (event: ReactPointerEvent<SVGSVGElement>) => {
    const svgElement = svgRef.current
    if (!svgElement) {
      return
    }

    const bounds = svgElement.getBoundingClientRect()
    const worldPoint = screenToWorld(
      {
        x: event.clientX - bounds.left,
        y: event.clientY - bounds.top,
      },
      transform,
    )
    const clampedPoint = clampPointToField(worldPoint, dimensions)

    setHoverPosition(worldPoint)
    onBallChange(clampedPoint)
  }

  const handlePointerDown = (event: ReactPointerEvent<SVGSVGElement>) => {
    if (!event.isPrimary) {
      return
    }

    activePointerId.current = event.pointerId
    event.currentTarget.setPointerCapture(event.pointerId)
    updateFromPointer(event)
  }

  const handlePointerMove = (event: ReactPointerEvent<SVGSVGElement>) => {
    const svgElement = svgRef.current
    if (!svgElement) {
      return
    }

    const bounds = svgElement.getBoundingClientRect()
    const worldPoint = screenToWorld(
      {
        x: event.clientX - bounds.left,
        y: event.clientY - bounds.top,
      },
      transform,
    )

    setHoverPosition(worldPoint)

    if (activePointerId.current === event.pointerId) {
      onBallChange(clampPointToField(worldPoint, dimensions))
    }
  }

  const releasePointer = (event: ReactPointerEvent<SVGSVGElement>) => {
    if (activePointerId.current !== event.pointerId) {
      return
    }

    activePointerId.current = null
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
  }

  return (
    <div className="field-frame" ref={frameRef}>
      <svg
        ref={svgRef}
        className="field-svg"
        viewBox={`0 0 ${transform.width} ${transform.height}`}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={releasePointer}
        onPointerCancel={releasePointer}
        onPointerLeave={() => setHoverPosition(null)}
      >
        <rect
          x="0"
          y="0"
          width={transform.width}
          height={transform.height}
          className="field-svg__background"
        />

        <g
          className="field-svg__world"
          transform={transformToSvgMatrix(transform)}
          vectorEffect="non-scaling-stroke"
        >
          <rect
            x={geometry.fieldRect.minX}
            y={geometry.fieldRect.minY}
            width={geometry.fieldRect.maxX - geometry.fieldRect.minX}
            height={geometry.fieldRect.maxY - geometry.fieldRect.minY}
            className="field-line"
          />
          <line
            x1={geometry.halfwayLine.start.x}
            y1={geometry.halfwayLine.start.y}
            x2={geometry.halfwayLine.end.x}
            y2={geometry.halfwayLine.end.y}
            className="field-line"
          />
          <circle
            cx={geometry.centreCircle.centre.x}
            cy={geometry.centreCircle.centre.y}
            r={geometry.centreCircle.radius}
            className="field-line"
          />
          <circle
            cx={geometry.centreMark.x}
            cy={geometry.centreMark.y}
            r="0.06"
            className="field-mark"
          />
          <rect
            x={geometry.goalAreas.left.minX}
            y={geometry.goalAreas.left.minY}
            width={geometry.goalAreas.left.maxX - geometry.goalAreas.left.minX}
            height={geometry.goalAreas.left.maxY - geometry.goalAreas.left.minY}
            className="field-line"
          />
          <rect
            x={geometry.goalAreas.right.minX}
            y={geometry.goalAreas.right.minY}
            width={
              geometry.goalAreas.right.maxX - geometry.goalAreas.right.minX
            }
            height={
              geometry.goalAreas.right.maxY - geometry.goalAreas.right.minY
            }
            className="field-line"
          />
          <rect
            x={geometry.penaltyAreas.left.minX}
            y={geometry.penaltyAreas.left.minY}
            width={
              geometry.penaltyAreas.left.maxX - geometry.penaltyAreas.left.minX
            }
            height={
              geometry.penaltyAreas.left.maxY - geometry.penaltyAreas.left.minY
            }
            className="field-line"
          />
          <rect
            x={geometry.penaltyAreas.right.minX}
            y={geometry.penaltyAreas.right.minY}
            width={
              geometry.penaltyAreas.right.maxX -
              geometry.penaltyAreas.right.minX
            }
            height={
              geometry.penaltyAreas.right.maxY -
              geometry.penaltyAreas.right.minY
            }
            className="field-line"
          />
          <circle
            cx={geometry.penaltyMarks.left.x}
            cy={geometry.penaltyMarks.left.y}
            r="0.06"
            className="field-mark"
          />
          <circle
            cx={geometry.penaltyMarks.right.x}
            cy={geometry.penaltyMarks.right.y}
            r="0.06"
            className="field-mark"
          />
          <circle
            cx={ball.x}
            cy={ball.y}
            r={BALL_RADIUS_METRES}
            className="ball-disc"
          />
          {robots.map((robot) => (
            <circle
              key={robot.id}
              cx={robot.position.x}
              cy={robot.position.y}
              r={ROBOT_RADIUS_METRES}
              className={
                robot.known ? 'robot-disc' : 'robot-disc robot-disc--bench'
              }
            />
          ))}
        </g>

        {geometry.cornerArcs.map((arc, index) => (
          <polyline
            key={`${arc.centre.x}-${arc.centre.y}-${index}`}
            points={sampleArc(arc)
              .map((point) => worldToScreen(point, transform))
              .map((point) => `${point.x},${point.y}`)
              .join(' ')}
            className="field-line"
          />
        ))}

        {showPlayerIds ? (
          <>
            {robots.map((robot) => {
              const screenPoint = worldToScreen(robot.position, transform)

              return (
                <text
                  key={`label-${robot.id}`}
                  className="robot-id"
                  x={screenPoint.x}
                  y={screenPoint.y}
                >
                  {robot.id}
                </text>
              )
            })}
          </>
        ) : null}
      </svg>

      <div className="field-frame__hud">
        <span>
          Ball: {ball.x.toFixed(2)} m, {ball.y.toFixed(2)} m
        </span>
        {hoverPosition ? (
          <span>
            Cursor: {hoverPosition.x.toFixed(2)} m, {hoverPosition.y.toFixed(2)}{' '}
            m
          </span>
        ) : null}
      </div>
    </div>
  )
}
