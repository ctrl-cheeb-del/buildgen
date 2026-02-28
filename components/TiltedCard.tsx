"use client";

import { useRef, useState } from "react";
import { motion, useMotionValue, useSpring } from "motion/react";

const springValues = {
  damping: 30,
  stiffness: 100,
  mass: 2,
};

export default function TiltedCard({
  imageSrc,
  altText = "Tilted card image",
  containerHeight = "300px",
  containerWidth = "100%",
  imageHeight = "300px",
  imageWidth = "300px",
  scaleOnHover = 1.1,
  rotateAmplitude = 14,
  borderRadius = "15px",
}: {
  imageSrc: string;
  altText?: string;
  containerHeight?: string;
  containerWidth?: string;
  imageHeight?: string;
  imageWidth?: string;
  scaleOnHover?: number;
  rotateAmplitude?: number;
  borderRadius?: string;
}) {
  const ref = useRef<HTMLElement>(null);

  const rotateX = useSpring(useMotionValue(0), springValues);
  const rotateY = useSpring(useMotionValue(0), springValues);
  const scale = useSpring(1, springValues);

  const [lastY, setLastY] = useState(0);

  function handleMouse(e: React.MouseEvent) {
    if (!ref.current) return;

    const rect = ref.current.getBoundingClientRect();
    const offsetX = e.clientX - rect.left - rect.width / 2;
    const offsetY = e.clientY - rect.top - rect.height / 2;

    const rotationX = (offsetY / (rect.height / 2)) * -rotateAmplitude;
    const rotationY = (offsetX / (rect.width / 2)) * rotateAmplitude;

    rotateX.set(rotationX);
    rotateY.set(rotationY);

    setLastY(offsetY);
  }

  function handleMouseEnter() {
    scale.set(scaleOnHover);
  }

  function handleMouseLeave() {
    scale.set(1);
    rotateX.set(0);
    rotateY.set(0);
  }

  return (
    <figure
      ref={ref}
      style={{
        height: containerHeight,
        width: containerWidth,
        perspective: "800px",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        position: "relative",
      }}
      onMouseMove={handleMouse}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      <motion.div
        style={{
          width: imageWidth,
          height: imageHeight,
          rotateX,
          rotateY,
          scale,
          transformStyle: "preserve-3d",
          position: "relative",
        }}
      >
        <motion.img
          src={imageSrc}
          alt={altText}
          style={{
            width: imageWidth,
            height: imageHeight,
            objectFit: "cover",
            borderRadius,
            willChange: "transform",
            transform: "translateZ(0)",
            position: "absolute",
            top: 0,
            left: 0,
          }}
        />
      </motion.div>
    </figure>
  );
}
