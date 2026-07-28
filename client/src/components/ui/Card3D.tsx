import React, { createContext, useContext, useRef, useEffect, useState } from 'react';
import './Card3D.css';

interface MouseEnterContextType {
  isMouseEntered: boolean;
}

const MouseEnterContext = createContext<MouseEnterContextType | undefined>(undefined);

export const useMouseEnter = () => {
  const context = useContext(MouseEnterContext);
  if (context === undefined) {
    throw new Error('useMouseEnter must be used within a MouseEnterProvider');
  }
  return context;
};

interface CardContainerProps {
  children?: React.ReactNode;
  className?: string;
  containerClassName?: string;
}

export const CardContainer = ({
  children,
  className,
  containerClassName,
}: CardContainerProps) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [isMouseEntered, setIsMouseEntered] = useState(false);

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!containerRef.current) return;
    const { left, top, width, height } = containerRef.current.getBoundingClientRect();
    const x = (e.clientX - left - width / 2) / 25;
    const y = (e.clientY - top - height / 2) / 25;
    containerRef.current.style.transform = `rotateY(${x}deg) rotateX(${y}deg)`;
  };

  const handleMouseEnter = () => {
    setIsMouseEntered(true);
  };

  const handleMouseLeave = () => {
    if (!containerRef.current) return;
    setIsMouseEntered(false);
    containerRef.current.style.transform = `rotateY(0deg) rotateX(0deg)`;
  };

  return (
    <MouseEnterContext.Provider value={{ isMouseEntered }}>
      <div
        className={`card-3d-container ${containerClassName || ''}`}
        style={{ perspective: '1000px' }}
      >
        <div
          ref={containerRef}
          onMouseEnter={handleMouseEnter}
          onMouseMove={handleMouseMove}
          onMouseLeave={handleMouseLeave}
          className={`card-3d-body glass-1 ${className || ''}`}
          style={{ transformStyle: 'preserve-3d' }}
        >
          {children}
        </div>
      </div>
    </MouseEnterContext.Provider>
  );
};

interface CardBodyProps {
  children: React.ReactNode;
  className?: string;
}

export const CardBody = ({ children, className }: CardBodyProps) => {
  return (
    <div
      className={`card-3d-item-wrapper ${className || ''}`}
      style={{
        width: '384px',
        height: '384px',
        transformStyle: 'preserve-3d',
      }}
    >
      {children}
    </div>
  );
};

interface CardItemProps extends React.HTMLAttributes<HTMLDivElement> {
  as?: React.ElementType;
  children: React.ReactNode;
  translateX?: number | string;
  translateY?: number | string;
  translateZ?: number | string;
  rotateX?: number | string;
  rotateY?: number | string;
  rotateZ?: number | string;
  [key: string]: any;
}

export const CardItem = ({
  as: Tag = 'div',
  children,
  className,
  translateX = 0,
  translateY = 0,
  translateZ = 0,
  rotateX = 0,
  rotateY = 0,
  rotateZ = 0,
  ...rest
}: CardItemProps) => {
  const ref = useRef<HTMLDivElement>(null);
  const { isMouseEntered } = useMouseEnter();

  useEffect(() => {
    handleAnimations();
  }, [isMouseEntered]);

  const handleAnimations = () => {
    if (!ref.current) return;
    if (isMouseEntered) {
      ref.current.style.transform = `translateX(${translateX}px) translateY(${translateY}px) translateZ(${translateZ}px) rotateX(${rotateX}deg) rotateY(${rotateY}deg) rotateZ(${rotateZ}deg)`;
    } else {
      ref.current.style.transform = `translateX(0px) translateY(0px) translateZ(0px) rotateX(0deg) rotateY(0deg) rotateZ(0deg)`;
    }
  };

  return (
    <Tag
      ref={ref}
      className={`card-3d-item ${className || ''}`}
      style={{ transformStyle: 'preserve-3d' }}
      {...rest}
    >
      {children}
    </Tag>
  );
};
