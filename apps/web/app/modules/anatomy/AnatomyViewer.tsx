import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { Button, LoadingState } from "@portable-ui/react";
import {
  ASSET_BASE,
  structureVisible,
  type AnatomyManifest,
  type Category,
} from "./model";
import { AnatomyLicenses } from "./AnatomyLicenses";
import type { AnatomyMessages } from "./messages";
import {
  DISPLAY_MASK,
  hasDisplayMask,
  isDisplayMasked,
  PERMANENTLY_HIDDEN,
} from "./display-policy";
import {
  clampTarget,
  easeInOutCubic,
  fitDistance,
  lerp3,
  viewPosition,
  type CameraView,
  type Vec3,
} from "./camera";
import styles from "./anatomy.module.css";

export type { CameraView } from "./camera";
/** A camera request from the page; `revision` makes repeated requests (two "zoom in" presses) distinct. */
export type CameraAction =
  CameraView | "reset" | "zoomIn" | "zoomOut" | "focus";
interface Props {
  manifest: AnatomyManifest;
  categories: Set<Category>;
  selected: Set<string>;
  /** Shown in a second highlight colour (e.g. secondary muscles); not picked, not framed. */
  secondary?: Set<string>;
  /** Heatmap: structure id → intensity 0–1, painted on a yellow → red ramp; other muscles turn grey. */
  heat?: Map<string, number>;
  /** Fly to the selection when it changes (default). Off for a fixed overview. */
  followSelection?: boolean;
  hidden: Set<string>;
  isolated: boolean;
  transparent: boolean;
  camera: { action: CameraAction; revision: number };
  onPick: (id: string) => void;
  messages: AnatomyMessages;
}
const HEAT_STOPS = [
  new THREE.Color(0xf6dd7a),
  new THREE.Color(0xf29a3e),
  new THREE.Color(0xd8343a),
];
const HEAT_NONE = 0x7d7672;
const heatColor = (value: number, target: THREE.Color) => {
  const t = Math.min(Math.max(value, 0), 1) * (HEAT_STOPS.length - 1);
  const i = Math.min(Math.floor(t), HEAT_STOPS.length - 2);
  return target.copy(HEAT_STOPS[i]!).lerp(HEAT_STOPS[i + 1]!, t - i);
};
const COLORS: Record<Category, number> = {
  muscles: 0xa76c63,
  skeleton: 0xd3c7ae,
  nervous: 0xd9ba65,
  tendons: 0xe2ddd0,
  ligaments: 0xb7b9a5,
  skin: 0xbda090,
  vascular: 0xa45454,
  organs: 0x927282,
  other: 0x8b969b,
};

function disposeGroup(group: THREE.Object3D) {
  group.traverse((object) => {
    if (object instanceof THREE.Mesh) {
      object.geometry.dispose();
      for (const material of Array.isArray(object.material)
        ? object.material
        : [object.material])
        material.dispose();
    }
  });
}

/** Camera and picking stay outside React; selection/visibility remain owned by the page. */
export default function AnatomyViewer(props: Props) {
  const host = useRef<HTMLDivElement>(null);
  const live = useRef(props);
  useEffect(() => {
    live.current = props;
  }, [props]);
  const engine = useRef<{
    invalidate: () => void;
    command: (action: CameraAction) => void;
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [hovered, setHovered] = useState("");
  useEffect(() => {
    const element = host.current;
    if (!element) return;
    const controller = new AbortController();
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    } catch {
      setError(live.current.messages.webgl);
      setLoading(false);
      return;
    }
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(35, 1, 1, 20000);
    const controls = new OrbitControls(camera, renderer.domElement);
    // A turntable: no rolling under the feet or over the head, zoom towards the pointer, screen-space pan.
    // Zoom limits follow the model's size once it has loaded.
    controls.enableDamping = true;
    controls.dampingFactor = 0.09;
    controls.rotateSpeed = 0.75;
    controls.panSpeed = 0.8;
    controls.zoomSpeed = 1.5;
    controls.zoomToCursor = true;
    controls.screenSpacePanning = true;
    controls.minPolarAngle = 0.08 * Math.PI;
    controls.maxPolarAngle = 0.92 * Math.PI;
    controls.minDistance = 100;
    controls.maxDistance = 7000;
    scene.add(new THREE.HemisphereLight(0xffffff, 0x585363, 2.5));
    const light = new THREE.DirectionalLight(0xffffff, 2.5);
    light.position.set(1500, 2500, 2000);
    scene.add(light);
    const root = new THREE.Group();
    root.rotation.x = -Math.PI / 2;
    scene.add(root);
    const meshes = new Map<
      string,
      THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial>
    >();
    const pending = new Set<string>();
    const loader = new GLTFLoader();
    let dirty = true,
      frame = 0,
      hoveredId = "",
      inFlight = 0;

    // The model's box in world space: the frame for named views and the limit for panning. Until a layer
    // has loaded, a standing adult (BodyParts3D uses millimetres) stands in for it.
    const bounds = new THREE.Box3(
      new THREE.Vector3(-350, 0, -200),
      new THREE.Vector3(350, 1750, 200),
    );
    let fitted = false,
      lastView: CameraView = "front",
      selectionKey = "";
    let flight: {
      from: Vec3;
      to: Vec3;
      fromTarget: Vec3;
      toTarget: Vec3;
      start: number;
      duration: number;
      orbit?: boolean;
    } | null = null;
    const reduceMotion =
      typeof matchMedia === "function" &&
      matchMedia("(prefers-reduced-motion: reduce)").matches;
    const vec = (v: THREE.Vector3): Vec3 => [v.x, v.y, v.z];
    const sizeOf = (box: THREE.Box3) => vec(box.getSize(new THREE.Vector3()));
    const centerOf = (box: THREE.Box3) =>
      vec(box.getCenter(new THREE.Vector3()));
    const fullDistance = () =>
      fitDistance(sizeOf(bounds), camera.fov, camera.aspect);
    const fly = (to: Vec3, toTarget: Vec3, duration = 520, orbit = false) => {
      if (reduceMotion || duration === 0) {
        flight = null;
        camera.position.set(...to);
        controls.target.set(...toTarget);
        controls.update();
      } else
        flight = {
          from: vec(camera.position),
          to,
          fromTarget: vec(controls.target),
          toTarget,
          start: performance.now(),
          duration,
          orbit,
        };
      dirty = true;
    };
    const view = (direction: CameraView, duration?: number) => {
      lastView = direction;
      const target = centerOf(bounds);
      // Swing around the body (angle and distance interpolated separately) instead of cutting through it.
      fly(
        viewPosition(direction, target, fullDistance()),
        target,
        duration ?? 700,
        true,
      );
    };
    /** Dollies along the line of sight, within the zoom limits. */
    const zoom = (factor: number) => {
      const offset = camera.position.clone().sub(controls.target);
      offset.setLength(
        THREE.MathUtils.clamp(
          offset.length() * factor,
          controls.minDistance,
          controls.maxDistance,
        ),
      );
      fly(vec(controls.target.clone().add(offset)), vec(controls.target), 420);
    };
    /** Frames a part of the model from the side the camera is on, never further out than the full view. */
    const frameBox = (box: THREE.Box3, duration?: number) => {
      const direction = camera.position
        .clone()
        .sub(controls.target)
        .normalize();
      // Never closer than ~half the body, so the selection keeps its surroundings for orientation.
      const full = fullDistance();
      const distance = THREE.MathUtils.clamp(
        fitDistance(sizeOf(box), camera.fov, camera.aspect, 2.2),
        full * 0.45,
        full,
      );
      const target = centerOf(box);
      fly(
        vec(
          new THREE.Vector3(...target).add(direction.multiplyScalar(distance)),
        ),
        target,
        duration,
      );
    };
    /** Brings the selected structures into view; without a selection, shows the whole model. */
    const focusSelection = (duration?: number) => {
      scene.updateMatrixWorld();
      const box = new THREE.Box3();
      for (const id of live.current.selected) {
        const mesh = meshes.get(id);
        if (mesh) box.expandByObject(mesh);
      }
      if (box.isEmpty()) view(lastView, duration);
      else frameBox(box, duration);
    };
    const command = (action: CameraAction) => {
      if (action === "reset") view("front");
      else if (action === "zoomIn") zoom(0.62);
      else if (action === "zoomOut") zoom(1.6);
      else if (action === "focus") focusSelection();
      else view(action);
    };
    /** Grows the frame to every loaded layer; the first load also sets zoom limits and frames the model. */
    const refit = () => {
      scene.updateMatrixWorld();
      const box = new THREE.Box3();
      for (const [id, mesh] of meshes)
        if (!PERMANENTLY_HIDDEN.has(id)) box.expandByObject(mesh);
      if (box.isEmpty()) return;
      if (fitted) bounds.union(box);
      else bounds.copy(box);
      const full = fullDistance();
      controls.minDistance = full * 0.12;
      controls.maxDistance = full * 2.4;
      camera.near = full / 200;
      camera.far = full * 10;
      camera.updateProjectionMatrix();
      if (fitted) return;
      fitted = true;
      selectionKey = [...live.current.selected].sort().join(",");
      if (live.current.followSelection === false) view(lastView, 0);
      else focusSelection(0);
    };
    view("front", 0);

    const structureById = new Map(
      props.manifest.structures.map((s) => [s.id, s]),
    );
    const loadLayers = () => {
      const current = live.current;
      for (const layer of current.manifest.layers) {
        const needed =
          current.categories.has(layer.id) ||
          current.manifest.structures.some(
            (s) =>
              s.category === layer.id &&
              (current.selected.has(s.id) || current.secondary?.has(s.id)),
          );
        if (!needed || pending.has(layer.id)) continue;
        pending.add(layer.id);
        inFlight++;
        setLoading(true);
        void (async () => {
          try {
            const response = await fetch(ASSET_BASE + layer.url, {
              signal: controller.signal,
            });
            if (!response.ok) throw new Error(`Asset HTTP ${response.status}`);
            const gltf = await loader.parseAsync(
              await response.arrayBuffer(),
              ASSET_BASE,
            );
            if (controller.signal.aborted) {
              disposeGroup(gltf.scene);
              return;
            }
            gltf.scene.traverse((object) => {
              if (!(object instanceof THREE.Mesh)) return;
              const metadata = structureById.get(object.name);
              if (!metadata)
                throw new Error(`Unknown anatomical identity: ${object.name}`);
              const previous = Array.isArray(object.material)
                ? object.material
                : [object.material];
              previous.forEach((m) => m.dispose());
              object.material = new THREE.MeshStandardMaterial({
                color: COLORS[metadata.category],
                roughness: 0.7,
                side: THREE.DoubleSide,
              });
              object.visible = !PERMANENTLY_HIDDEN.has(metadata.id);
              // Only covering surfaces need regional clipping; muscles and other anatomy retain their complete geometry.
              if (hasDisplayMask(metadata.id)) {
                object.material.onBeforeCompile = (
                  shader: THREE.WebGLProgramParametersWithUniforms,
                ) => {
                  shader.uniforms.tfMaskMin = {
                    value: new THREE.Vector3(...DISPLAY_MASK.min),
                  };
                  shader.uniforms.tfMaskMax = {
                    value: new THREE.Vector3(...DISPLAY_MASK.max),
                  };
                  shader.vertexShader =
                    "varying vec3 vTfAnatomyPosition;\n" +
                    shader.vertexShader.replace(
                      "#include <begin_vertex>",
                      "#include <begin_vertex>\nvTfAnatomyPosition = transformed;",
                    );
                  shader.fragmentShader =
                    "varying vec3 vTfAnatomyPosition;\nuniform vec3 tfMaskMin;\nuniform vec3 tfMaskMax;\n" +
                    shader.fragmentShader.replace(
                      "#include <clipping_planes_fragment>",
                      "#include <clipping_planes_fragment>\nif (all(greaterThanEqual(vTfAnatomyPosition, tfMaskMin)) && all(lessThanEqual(vTfAnatomyPosition, tfMaskMax))) discard;",
                    );
                };
                object.material.customProgramCacheKey = () =>
                  "trainflow-anatomy-display-mask-v1";
              }
              if (!object.geometry.attributes.normal)
                object.geometry.computeVertexNormals();
              meshes.set(
                metadata.id,
                object as THREE.Mesh<
                  THREE.BufferGeometry,
                  THREE.MeshStandardMaterial
                >,
              );
            });
            root.add(gltf.scene);
            setError("");
            refit();
            dirty = true;
          } catch (failure) {
            if (!controller.signal.aborted) {
              pending.delete(layer.id);
              setError(
                `${live.current.messages.failure} ${failure instanceof Error ? failure.message : ""}`,
              );
            }
          } finally {
            inFlight--;
            if (!controller.signal.aborted && inFlight === 0) setLoading(false);
          }
        })();
      }
    };
    engine.current = {
      invalidate: () => {
        dirty = true;
        loadLayers();
        // A new selection (from the list or the model) flies to it; clearing it leaves the camera where it is.
        const key = [...live.current.selected].sort().join(",");
        if (key === selectionKey) return;
        selectionKey = key;
        if (key && fitted && live.current.followSelection !== false)
          focusSelection();
      },
      command,
    };
    element.append(renderer.domElement);
    const resize = new ResizeObserver(() => {
      const { width, height } = element.getBoundingClientRect();
      renderer.setSize(width, height);
      camera.aspect = width / Math.max(height, 1);
      camera.updateProjectionMatrix();
      dirty = true;
    });
    resize.observe(element);
    // Panning may not carry the model out of the frame.
    const keepTarget = () => {
      const current = vec(controls.target);
      const clamped = clampTarget(current, vec(bounds.min), vec(bounds.max));
      if (clamped.some((value, axis) => value !== current[axis]))
        controls.target.set(...clamped);
      dirty = true;
    };
    // Grabbing the model cancels a flight instead of fighting it.
    const interrupt = () => {
      flight = null;
    };
    controls.addEventListener("change", keepTarget);
    controls.addEventListener("start", interrupt);
    const raycaster = new THREE.Raycaster();
    const cast = (event: MouseEvent) => {
      const rect = renderer.domElement.getBoundingClientRect();
      raycaster.setFromCamera(
        new THREE.Vector2(
          ((event.clientX - rect.left) / rect.width) * 2 - 1,
          (-(event.clientY - rect.top) / rect.height) * 2 + 1,
        ),
        camera,
      );
      const hits = raycaster.intersectObjects(
        [...meshes.values()].filter((mesh) => mesh.visible),
        false,
      );
      return hits.find(
        (hit) =>
          !isDisplayMasked(
            hit.object.name,
            root.worldToLocal(hit.point.clone()),
          ),
      );
    };
    const hit = (event: PointerEvent) => cast(event)?.object.name;
    let pointerStart: { x: number; y: number } | null = null;
    const down = (event: PointerEvent) => {
      if (event.button === 0)
        pointerStart = { x: event.clientX, y: event.clientY };
    };
    const up = (event: PointerEvent) => {
      if (
        pointerStart &&
        Math.hypot(
          event.clientX - pointerStart.x,
          event.clientY - pointerStart.y,
        ) < 5
      ) {
        const id = hit(event);
        if (id) live.current.onPick(id);
      }
      pointerStart = null;
    };
    const move = (event: PointerEvent) => {
      if (event.buttons) return;
      const id = hit(event) ?? "";
      if (id === hoveredId) return;
      hoveredId = id;
      renderer.domElement.style.cursor = id ? "pointer" : "";
      setHovered(structureById.get(id)?.name ?? "");
      dirty = true;
    };
    const leave = () => {
      hoveredId = "";
      pointerStart = null;
      renderer.domElement.style.cursor = "";
      setHovered("");
      dirty = true;
    };
    /** Double-click flies closer to the point under the pointer. */
    const focusPoint = (event: MouseEvent) => {
      const point = cast(event)?.point;
      if (!point) return;
      const offset = camera.position.clone().sub(controls.target);
      offset.setLength(
        THREE.MathUtils.clamp(
          offset.length() * 0.55,
          controls.minDistance,
          controls.maxDistance,
        ),
      );
      fly(vec(point.clone().add(offset)), vec(point));
    };
    /** Arrows orbit (left/right around the body, up/down over it, Shift for bigger steps); + / − zoom; Home resets. */
    const key = (event: KeyboardEvent) => {
      if (event.key === "Home") view("front");
      else if (event.key === "+" || event.key === "=") zoom(0.75);
      else if (event.key === "-" || event.key === "_") zoom(1.33);
      else if (event.key.startsWith("Arrow")) {
        flight = null;
        const spherical = new THREE.Spherical().setFromVector3(
          camera.position.clone().sub(controls.target),
        );
        const step = event.shiftKey ? 0.35 : 0.12;
        if (event.key === "ArrowLeft") spherical.theta -= step;
        else if (event.key === "ArrowRight") spherical.theta += step;
        else
          spherical.phi = THREE.MathUtils.clamp(
            spherical.phi + (event.key === "ArrowUp" ? -step : step),
            controls.minPolarAngle,
            controls.maxPolarAngle,
          );
        camera.position
          .copy(controls.target)
          .add(new THREE.Vector3().setFromSpherical(spherical));
        controls.update();
        dirty = true;
      } else return;
      event.preventDefault();
    };
    let wheelPending = 0,
      wheelX = 0,
      wheelY = 0;
    const wheel = (event: WheelEvent) => {
      if (!event.isTrusted || event.ctrlKey) return; // our own eased steps (and pinch-zoom gestures) go straight through
      event.preventDefault();
      event.stopPropagation();
      // Lines and pages become pixels, so every wheel and trackpad zooms at a similar rate.
      wheelPending +=
        event.deltaY *
        (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? 400 : 1);
      wheelPending = THREE.MathUtils.clamp(wheelPending, -1200, 1200);
      wheelX = event.clientX;
      wheelY = event.clientY;
      dirty = true;
    };
    element.addEventListener("wheel", wheel, { capture: true, passive: false });
    element.addEventListener("keydown", key);
    renderer.domElement.addEventListener("pointerdown", down);
    renderer.domElement.addEventListener("pointerup", up);
    renderer.domElement.addEventListener("pointermove", move);
    renderer.domElement.addEventListener("pointerleave", leave);
    renderer.domElement.addEventListener("dblclick", focusPoint);
    const animate = () => {
      frame = requestAnimationFrame(animate);
      if (flight) {
        const t = (performance.now() - flight.start) / flight.duration;
        const eased = easeInOutCubic(t);
        const target = lerp3(flight.fromTarget, flight.toTarget, eased);
        controls.target.set(...target);
        if (flight.orbit) {
          const a = new THREE.Spherical().setFromVector3(
            new THREE.Vector3(...flight.from).sub(
              new THREE.Vector3(...flight.fromTarget),
            ),
          );
          const b = new THREE.Spherical().setFromVector3(
            new THREE.Vector3(...flight.to).sub(
              new THREE.Vector3(...flight.toTarget),
            ),
          );
          let turn = b.theta - a.theta;
          turn = Math.atan2(Math.sin(turn), Math.cos(turn));
          const s = new THREE.Spherical(
            a.radius + (b.radius - a.radius) * eased,
            a.phi + (b.phi - a.phi) * eased,
            a.theta + turn * eased,
          );
          camera.position
            .copy(controls.target)
            .add(new THREE.Vector3().setFromSpherical(s));
        } else camera.position.set(...lerp3(flight.from, flight.to, eased));
        if (t >= 1) flight = null;
        dirty = true;
      }
      if (Math.abs(wheelPending) > 0.5) {
        // A fifth of what is left each frame: quick to start, soft to stop.
        const step =
          Math.abs(wheelPending) < 2 ? wheelPending : wheelPending * 0.2;
        wheelPending -= step;
        renderer.domElement.dispatchEvent(
          new WheelEvent("wheel", {
            deltaY: step,
            clientX: wheelX,
            clientY: wheelY,
            bubbles: true,
            cancelable: true,
          }),
        );
        dirty = true;
      } else wheelPending = 0;
      if (controls.update()) dirty = true;
      if (!dirty) return;
      const current = live.current;
      for (const [id, mesh] of meshes) {
        const structure = structureById.get(id)!;
        const secondary =
          !current.selected.has(id) && current.secondary?.has(id);
        mesh.visible =
          secondary ||
          structureVisible(
            id,
            structure.category,
            current.categories,
            current.hidden,
            current.selected,
            current.isolated,
          );
        const heat = current.heat?.get(id);
        if (current.heat && !current.selected.has(id)) {
          if (heat !== undefined) heatColor(heat, mesh.material.color);
          else
            mesh.material.color.setHex(
              structure.category === "muscles"
                ? HEAT_NONE
                : COLORS[structure.category],
            );
          if (id === hoveredId)
            mesh.material.color.lerp(new THREE.Color(0xffffff), 0.25);
        } else
          mesh.material.color.setHex(
            current.selected.has(id)
              ? 0x3ee09a
              : secondary
                ? 0xe0b04a
                : id === hoveredId
                  ? 0xe4d6bf
                  : COLORS[structure.category],
          );
        mesh.material.transparent =
          current.transparent && !current.selected.has(id) && !secondary;
        mesh.material.opacity = mesh.material.transparent ? 0.23 : 1;
        mesh.material.depthWrite = !mesh.material.transparent;
        mesh.material.depthTest = true;
        mesh.renderOrder = 0;
      }
      renderer.render(scene, camera);
      dirty = false;
    };
    loadLayers();
    animate();
    return () => {
      controller.abort();
      cancelAnimationFrame(frame);
      resize.disconnect();
      controls.removeEventListener("change", keepTarget);
      controls.removeEventListener("start", interrupt);
      controls.dispose();
      element.removeEventListener("keydown", key);
      element.removeEventListener("wheel", wheel, { capture: true });
      renderer.domElement.removeEventListener("pointerdown", down);
      renderer.domElement.removeEventListener("pointerup", up);
      renderer.domElement.removeEventListener("pointermove", move);
      renderer.domElement.removeEventListener("pointerleave", leave);
      renderer.domElement.removeEventListener("dblclick", focusPoint);
      disposeGroup(root);
      renderer.dispose();
      renderer.domElement.remove();
      engine.current = null;
    };
  }, [props.manifest]);
  useEffect(() => {
    engine.current?.invalidate();
  }, [
    props.categories,
    props.selected,
    props.secondary,
    props.heat,
    props.hidden,
    props.isolated,
    props.transparent,
  ]);
  useEffect(() => {
    if (props.camera.revision > 0) engine.current?.command(props.camera.action);
  }, [props.camera]);
  return (
    <div className={styles.viewport} aria-busy={loading}>
      <div
        ref={host}
        className={styles.canvas}
        tabIndex={0}
        role="application"
        aria-label={props.messages.viewer}
        aria-describedby="anatomy-controls-help"
      />
      {loading && (
        <div className={styles.overlay}>
          <LoadingState label={props.messages.loading} />
        </div>
      )}
      {error && (
        <div className={styles.viewerError} role="alert">
          {error}
          {engine.current && (
            <Button
              size="sm"
              variant="ghost"
              onPress={() => engine.current?.invalidate()}
            >
              {props.messages.retry}
            </Button>
          )}
        </div>
      )}
      {hovered && (
        <div className={styles.hoverLabel} role="status">
          {hovered}
        </div>
      )}
      <AnatomyLicenses
        attribution={props.manifest.attribution}
        messages={props.messages}
      />
    </div>
  );
}
