import { describe, expect, it } from 'vitest';
import { simplifyPandaModelXml } from '../../RobotLoader';

describe('simplifyPandaModelXml', () => {
  it('leaves panda mesh assets and collision geoms untouched', () => {
    const xml = `
      <mujoco model="panda">
        <asset>
          <mesh name="link0_visual" file="link0_0.obj"/>
          <mesh file="link0.stl"/>
        </asset>
        <worldbody>
          <body name="link1"><geom mesh="link0_visual" class="visual"/></body>
          <body name="link0"><geom mesh="link0_0" class="visual"/></body>
          <body name="link2"><geom mesh="link0_c" class="collision"/></body>
          <body name="hand"></body>
        </worldbody>
      </mujoco>
    `;

    const simplified = simplifyPandaModelXml(xml);

    expect(simplified).toContain('.obj');
    expect(simplified).toContain('.stl');
    expect(simplified).toContain('mesh="link0_c"');
    expect(simplified).not.toContain('site name="tcp"');
    expect(simplified).not.toContain('geom type="capsule"');
  });
});
