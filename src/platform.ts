import { API, DynamicPlatformPlugin, Logger, PlatformAccessory, PlatformConfig, Service, Characteristic } from 'homebridge';
import http, {IncomingMessage, Server, ServerResponse} from 'http';

import { PLATFORM_NAME, PLUGIN_NAME, DEVICE_COUNT } from './settings';
import { HomebridgePlatformAccessory } from './platformAccessory';
import { Mutex } from 'async-mutex';
import bent from 'bent';

/**
 * HomebridgePlatform
 * This class is the main constructor for your plugin, this is where you should
 * parse the user config and discover/register accessories with Homebridge.
 */
export class HomebridgePlatform implements DynamicPlatformPlugin {
  private requestServer?: Server;
  private lastPostString = '';
  public LastUpdatedDevice = 0;
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
    // const status = await this.getStatusFromDevice();
    // console.log(status)
    for (let i = 0; i < DEVICE_COUNT; i++) {
      const uniqueId = 'L'+('00' + i).slice(-2);
      const uuid = this.api.hap.uuid.generate(uniqueId);
      let accessory = this.accessories.find(accessory => accessory.UUID === uuid);
      if (accessory) {
        this.log.info('Restoring existing accessory from cache:', accessory.displayName);
        this.api.updatePlatformAccessories([accessory]);
      } else {
        this.log.info('Adding new accessory:', uniqueId);
        accessory = new this.api.platformAccessory(uniqueId, uuid);
        accessory.context.index = i;
        this.api.registerPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [accessory]);
      }
      new HomebridgePlatformAccessory(this, accessory);
    }
  }

  createHttpService() {
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

  private updateHomeKit(accessory, value: boolean) {
    if (accessory.context.statusOn !== value) {
      accessory.context.statusOn = value;
      const service = accessory.getService(this.Service.Lightbulb);
      this.log.debug(`Update Characteristic On L${accessory.context.index}-> ${value}`);
      (service as Service).updateCharacteristic(this.Characteristic.On, value);
    }
  }


  setStatus(statuses) {
    statuses.forEach((status, i) => {
      this.updateHomeKit(this.accessories[i], status === 1);
    });
  }

  getStatusFromAccessories(): string {
    let ret = '';
    this.accessories.forEach(accessory => {      
      ret = `${ret}${accessory.context.statusOn? '1':'0'}`;
    });
    return ret;
  }

  async updateDevice() {
    const mutex = new Mutex();
    await mutex.runExclusive(async () => {
      const postString = this.getStatusFromAccessories();
      if (postString !== this.lastPostString) {
        try {
          const post = bent(this.config.url as string, 'POST', 'string');
          post('set_status', postString);
          console.log(postString)
          this.lastPostString = postString;
        } catch (exception) {
          this.log.error(`ERROR received from ${this.config.url as string}: ${exception}`);
        }
      }
    });
  }

}
