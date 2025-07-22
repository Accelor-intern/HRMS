import React, { useEffect, useState } from "react";
import { motion } from "framer-motion";

const SplashScreen = () => {
  const [isVisible, setIsVisible] = useState(true);
  const [randomImage, setRandomImage] = useState("");

  const cartoonImages = [
    "https://www.shutterstock.com/image-vector/angry-bird-character-illustration-white-600nw-2494478905.jpg", // smiling girl
    "https://www.shutterstock.com/image-vector/cartoon-background-transparent-doraemon-nobita-600nw-2364737497.jpg", // boy with specs
   "https://hips.hearstapps.com/hmg-prod/amv-prod-cad-assets/wp-content/uploads/2014/06/Unknown-2-626x391.jpeg",
   "https://img.freepik.com/free-photo/anime-like-illustration-girl-kimono_23-2151835214.jpg?semt=ais_hybrid&w=740",

    
  ];

  useEffect(() => {
    // Select a random image on mount
    const randomIndex = Math.floor(Math.random() * cartoonImages.length);
    setRandomImage(cartoonImages[randomIndex]);

    // Hide splash after timeout
    const timer = setTimeout(() => {
      setIsVisible(false);
    }, 3000);

    return () => clearTimeout(timer);
  }, []);

  if (!isVisible) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: -30 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -30 }}
      transition={{ duration: 0.6 }}
      className="fixed inset-0 bg-white bg-opacity-90 flex items-center justify-center z-50"
    >
      <div className="w-[480px] max-w-full text-center p-8 bg-gray-100 rounded-2xl shadow-2xl border border-blue-300">
        <div className="flex flex-col items-center justify-center mb-6">
          <img
            src={randomImage}
            alt="Cartoon Avatar"
            className="w-28 h-28 rounded-full mb-4 shadow-md"
          />
          <h3 className="text-xl font-bold text-blue-800 mb-1"> 🎉 Welcome back! We missed you. 💼💙</h3>
          <p className="text-lg text-gray-600"> </p>
        </div>
        <p className="text-sm text-gray-400"></p>
      </div>
    </motion.div>
  );
};

export default SplashScreen;
