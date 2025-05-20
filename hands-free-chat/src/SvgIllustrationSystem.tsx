import React from 'react';
import Lottie from 'lottie-react';

interface SvgIllustrationSystemProps {
  animationData: any; // Replace 'any' with a more specific type if you have one
  loop?: boolean;
  autoplay?: boolean;
  style?: React.CSSProperties;
}

const SvgIllustrationSystem: React.FC<SvgIllustrationSystemProps> = ({
  animationData,
  loop = true,
  autoplay = true,
  style,
}) => {
  return (
    <Lottie
      animationData={animationData}
      loop={loop}
      autoplay={autoplay}
      style={style}
    />
  );
};

export default SvgIllustrationSystem;