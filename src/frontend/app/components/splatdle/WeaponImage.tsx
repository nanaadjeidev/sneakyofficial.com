import { useState } from "react";
import { Gamepad2 } from "lucide-react";
import type { Weapon, WeaponClass } from "../../types/splatdle";

const CLASS_GRADIENTS: Record<WeaponClass, string> = {
  Shooter: "from-orange-400 to-red-500",
  Charger: "from-blue-400 to-purple-500",
  Roller: "from-green-400 to-teal-500",
  Brush: "from-pink-400 to-purple-500",
  Slosher: "from-cyan-400 to-blue-500",
  Splatling: "from-yellow-400 to-orange-500",
  Dualies: "from-purple-400 to-pink-500",
  Brella: "from-gray-400 to-blue-600",
  Splatana: "from-lime-400 to-emerald-500",
  Rainmaker: "from-red-400 to-orange-500",
};

export function WeaponImage({ weapon, className = "" }: { weapon: Weapon; className?: string }) {
  const [error, setError] = useState(false);
  return (
    <div className={`relative ${className}`}>
      {!error ? (
        <img
          src={`/images/${encodeURIComponent(weapon.image)}`}
          alt={weapon.name}
          className="w-full h-full object-contain"
          onError={() => setError(true)}
        />
      ) : (
        <div
          className={`w-full h-full bg-gradient-to-br ${CLASS_GRADIENTS[weapon.class]} rounded-lg flex items-center justify-center`}
        >
          <Gamepad2 className="h-5 w-5 text-white opacity-80" />
        </div>
      )}
    </div>
  );
}
