import { Service, PlatformAccessory, CharacteristicValue, CharacteristicSetCallback, CharacteristicGetCallback } from 'homebridge';
import { HomebridgePlatform } from './platform';


// https://github.com/homebridge/homebridge/issues/1455

// https://github.com/ebaauw/homebridge-hue/blob/1448ec5f6865e3fbf72f5fa760ab91c59263adc1/lib/HueLight.js#L886
// https://github.com/ebaauw/homebridge-hue/blob/a10f39d94d8cd4d26b5fe39477ccf78d7a1c7a1e/lib/HueBridge.js#L136


/**
 * Platform Accessory
 * An instance of this class is created for each accessory your platform registers
 * Each accessory may expose multiple services of different service types.
 */
export class HomebridgePlatformAccessory {
  private service: Service;


  constructor(
    private readonly platform: HomebridgePlatform,
    private readonly accessory: PlatformAccessory,
  ) {

    this.accessory.getService(this.platform.Service.AccessoryInformation)!
      .setCharacteristic(this.platform.Characteristic.Manufacturer, 'Default-Manufacturer')
      .setCharacteristic(this.platform.Characteristic.Model, 'Default-Model')
      .setCharacteristic(this.platform.Characteristic.SerialNumber, 'Default-Serial');
    this.service = this.accessory.getService(this.platform.Service.Lightbulb) || this.accessory.addService(this.platform.Service.Lightbulb);

    // each service must implement at-minimum the "required characteristics" for the given service type
    // see https://developers.homebridge.io/#/service/Lightbulb

    this.service.getCharacteristic(this.platform.Characteristic.On)
      .on('set', this.setOn.bind(this))                // SET - bind to the `setOn` method below
      .on('get', this.getOn.bind(this));               // GET - bind to the `getOn` method below
  }

  setOn(value: CharacteristicValue, callback: CharacteristicSetCallback) {
    this.accessory.context.statusOn = value as boolean;
    setTimeout(async() => {
      this.platform.updateDevice();
    }, 20);
    this.platform.log.debug('Set Characteristic On ->', value);
    callback(null);
  }

  getOn(callback: CharacteristicGetCallback) {
    const isOn = this.accessory.context.statusOn;
    this.platform.log.debug(`Get Characteristic On L${this.accessory.context.index}-> ${isOn}`);
    callback(null, isOn);
  }

}