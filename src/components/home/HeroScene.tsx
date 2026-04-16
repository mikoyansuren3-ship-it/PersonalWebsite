'use client'

import { useRef } from 'react'
import { Canvas, useFrame } from '@react-three/fiber'
import { MeshDistortMaterial, Float, Environment } from '@react-three/drei'
import * as THREE from 'three'

function GeometricMesh() {
  const meshRef = useRef<THREE.Mesh>(null)

  useFrame((state) => {
    if (!meshRef.current) return
    meshRef.current.rotation.x = state.clock.elapsedTime * 0.12
    meshRef.current.rotation.y = state.clock.elapsedTime * 0.18
  })

  return (
    <Float speed={1.2} rotationIntensity={0.4} floatIntensity={0.6}>
      <mesh ref={meshRef} castShadow>
        <icosahedronGeometry args={[1.6, 1]} />
        <MeshDistortMaterial
          color="#1a1025"
          emissive="#F97316"
          emissiveIntensity={0.15}
          metalness={0.9}
          roughness={0.15}
          distort={0.25}
          speed={1.5}
        />
      </mesh>
    </Float>
  )
}

function OrbLight() {
  const lightRef = useRef<THREE.PointLight>(null)

  useFrame((state) => {
    if (!lightRef.current) return
    lightRef.current.position.x = Math.sin(state.clock.elapsedTime * 0.5) * 3
    lightRef.current.position.y = 2 + Math.cos(state.clock.elapsedTime * 0.3) * 0.5
  })

  return (
    <>
      {/* Warm orange key light */}
      <pointLight
        ref={lightRef}
        color="#F97316"
        intensity={40}
        distance={10}
        position={[2, 2, 2]}
      />
      {/* Glowing orb mesh (visible) */}
      <mesh position={[2, 2.5, 1]}>
        <sphereGeometry args={[0.12, 16, 16]} />
        <meshStandardMaterial
          color="#FEA44C"
          emissive="#F97316"
          emissiveIntensity={3}
          toneMapped={false}
        />
      </mesh>
      {/* Fill light */}
      <pointLight color="#EA580C" intensity={10} position={[-3, -1, -2]} />
      {/* Rim light */}
      <pointLight color="#FB923C" intensity={5} position={[0, -3, 3]} />
    </>
  )
}

export default function HeroScene() {
  return (
    <div className="absolute inset-0 w-full h-full" aria-hidden>
      <Canvas
        camera={{ position: [0, 0, 5], fov: 45 }}
        gl={{ antialias: true, alpha: true }}
        style={{ background: 'transparent' }}
      >
        <ambientLight intensity={0.05} />
        <OrbLight />
        <GeometricMesh />
        <Environment preset="night" />
      </Canvas>
    </div>
  )
}
