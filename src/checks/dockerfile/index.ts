// Dockerfile checks — side-effect imports to register all checks
import './layer-order.js';
import './missing-multistage.js';
import './npm-install.js';
import './node-env-trap.js';
import './base-image-latest.js';
import './alpine-native.js';
import './running-as-root.js';
import './missing-chown.js';
import './shell-form.js';
