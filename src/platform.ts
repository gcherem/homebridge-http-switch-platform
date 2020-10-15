import { API, DynamicPlatformPlugin, Logger, PlatformAccessory, PlatformConfig, Service, Characteristic } from 'homebridge';
import http, {IncomingMessage, Server, ServerResponse} from 'http';

import { PLATFORM_NAME, PLUGIN_NAME, DEVICE_COUNT } from './settings';
import { ExamplePlatformAccessory } from './platformAccessory';
import * as request from 'request-promise-native';

/**
 * HomebridgePlatform
 * This class is the main constructor for your plugin, this is where you should
 * parse the user config and discover/register accessories with Homebridge.
 */
export class HomebridgePlatform implements DynamicPlatformPlugin {
  private requestServer?: Server;
  public readonly Service: typeof Service = this.api.hap.Service;
  public readonly Characteristic: typeof Characteristic = this.api.hap.Characteristic;

  // this is used to track restored cached accessories
  public readonly accessories: PlatformAccessory[] = [];


  constructor(
    public readonly log: Logger,
    public readonly config: PlatformConfig,
    public readonly api: API,
  ) {
    this.log.debug('Finished initializing platform:', this.config.name);

    // When this event is fired it means Homebridge has restored all cached accessories from disk.
    // Dynamic Platform plugins should only register new accessories after this event was fired,
    // in order to ensure they weren't added to homebridge already. This event can also be used
    // to start discovery of new accessories.
    this.api.on('didFinishLaunching', () => {
      log.debug('Executed didFinishLaunching callback');
      // run the method to discover / register your devices as accessories
      this.discoverDevices();
      this.createHttpService();
    });
  }

  /**
   * This function is invoked when homebridge restores cached accessories from disk at startup.
   * It should be used to setup event handlers for characteristics and update respective values.
   */
  configureAccessory(accessory: PlatformAccessory) {
    this.log.info('Loading accessory from cache:', accessory.displayName);

    // add the restored accessory to the accessories cache so we can track if it has already been registered
    this.accessories.push(accessory);
  }

  /**
   * This is an example method showing how to register discovered accessories.
   * Accessories must only be registered once, previously created accessories
   * must not be registered again to prevent "duplicate UUID" errors.
   */
  async discoverDevices() {
    const status = await this.getStatus();
    for (let i = 0; i < DEVICE_COUNT; i++) {
      const uniqueId = 'L'+('00' + i).slice(-2);
      const uuid = this.api.hap.uuid.generate(uniqueId);
      const existingAccessory = this.accessories.find(accessory => accessory.UUID === uuid);
      if (existingAccessory) {
        this.log.info('Restoring existing accessory from cache:', existingAccessory.displayName);
        new ExamplePlatformAccessory(this, existingAccessory);
        existingAccessory.context.index = i;
        existingAccessory.context.statusOn = status[i]===1;
        this.api.updatePlatformAccessories([existingAccessory]);
      } else {
        this.log.info('Adding new accessory:', uniqueId);
        const accessory = new this.api.platformAccessory(uniqueId, uuid);
        accessory.context.index = i;
        accessory.context.statusOn = status[i]===1;
        new ExamplePlatformAccessory(this, accessory);
        this.api.registerPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [accessory]);
      }
    }
  }

  async getStatus() {
    const url = `${this.config.url}get_status`;
    let response;
    try {
      response = await request.get({url});
    } catch (exception) {
      this.log.error(`ERROR received from ${url}: ${exception}`);
    }
    return JSON.parse(response).st;
  }

  createHttpService() {
    // const port = this.config.port || 
    this.requestServer = http.createServer(this.handleRequest.bind(this));
    this.requestServer.listen(this.config.localPort, () => this.log.info(`Http server listening on ${this.config.localPort}...`));
  }

  private handleRequest(request: IncomingMessage, response: ServerResponse) {
    if (request.url === '/setStatus') {
      const chucks = [];
      request
        .on('data', (chunk) => {
          chucks.push(chunk as never);
        })
        .on('end', () => {
          const body = Buffer.concat(chucks).toString();
          this.setStatus(JSON.parse(body).st);
        });
    }
    response.writeHead(204); // 204 No content
    response.end();
  }

  setStatus(statuses) {
    statuses.forEach((status, i) => {
      const on = status === 1;
      if (this.accessories[i].context.statusOn !== on) {
        this.accessories[i].context.statusOn = on;
        const service = this.accessories[i].getService(this.Service.Lightbulb);
        (service as Service).updateCharacteristic(this.Characteristic.On, on);
      }
    });
  }

}
