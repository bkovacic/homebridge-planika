import { Service, PlatformAccessory, CharacteristicValue } from 'homebridge';

import { PlanikaHomebridgePlatform } from './platform';

import axios from 'axios';
import parser from 'fast-xml-parser';
import url from 'url';

export class PlanikaPlatformAccessory {
  private fireplaceService: Service;
  private fuelLevelService: Service;

  private state = {
    On: false,
    FlameSize: 2, // 1 to 6
    FuelLevel: 0, // 0 to 4
    StatusCode: 1,
  };

  private planikaStates = new Array(256);
  constructor(
    private readonly platform: PlanikaHomebridgePlatform,
    private readonly accessory: PlatformAccessory,
  ) {
    this.accessory.getService(this.platform.Service.AccessoryInformation)!
      .setCharacteristic(this.platform.Characteristic.Manufacturer, 'Planika')
      .setCharacteristic(this.platform.Characteristic.Model, 'Fireplace')
      .setCharacteristic(this.platform.Characteristic.SerialNumber, '?? N/A');

    this.fireplaceService = this.accessory.getService(this.platform.Service.Lightbulb) ||
      this.accessory.addService(this.platform.Service.Lightbulb);

    this.fireplaceService.setCharacteristic(this.platform.Characteristic.Name, accessory.context.device.name);

    this.fireplaceService.getCharacteristic(this.platform.Characteristic.On)
      .onSet(this.setOn.bind(this))
      .onGet(this.getOn.bind(this));

    this.fireplaceService.getCharacteristic(this.platform.Characteristic.Brightness)
      .onSet(this.setFlameSize.bind(this))
      .onGet(this.getFlameSize.bind(this));

    this.fuelLevelService = this.accessory.getService(this.platform.Service.Battery) ||
      this.accessory.addService(this.platform.Service.Battery);

    this.fuelLevelService.getCharacteristic(this.platform.Characteristic.StatusLowBattery)
      .onGet(this.getStatusLowBattery.bind(this));

    this.fuelLevelService.getCharacteristic(this.platform.Characteristic.BatteryLevel)
      .onGet(this.getBatteryLevel.bind(this));

    this.fuelLevelService.getCharacteristic(this.platform.Characteristic.ChargingState)
      .onGet(this.getChargingState.bind(this));

    setInterval(() => {
      this.RefreshState();
    }, 5000);
  }

  private RefreshState() {
    const logger = this.platform.log;

    axios.get('http://' + this.platform.config.IP + '/state.xml',
      { responseType: 'document' },
    ).then((response) => {
      const r = parser.parse(response.data);

      // Planika flame sizes go from 2 to 12 with a step of 2
      this.state.FlameSize = r.params.param.find(p => p.name === 'flame').value / 2;
      this.state.FuelLevel = r.params.param.find(p => p.name === 'fuel').value;
      this.state.StatusCode = r.params.param.find(p => p.name === 'tryb').value;

      logger.debug('Current state: ' + this.state.StatusCode.toString() + ', flame size: ' +
        this.state.FlameSize.toString() + ', fuel level: ' + this.state.FuelLevel.toString());

      switch (this.state.StatusCode) {
        case 2:   //PLEASE WAIT
        case 3:   //COOLING THE DEVICE
        case 7:   //COOLING HIT
        case 8:   //COOLING TILTED DEVICE
        case 9:   //COOLING THE DEVICE
        case 15:  //COOLING THE DEVICE
        case 19:  //COOLING - CO2
        case 20:  //WORKING
          this.state.On = true;
          break;

        default:
          this.state.On = false;
          break;
      }

      this.fireplaceService.updateCharacteristic(this.platform.Characteristic.Brightness, this.state.FlameSize * (100/6));
      this.fireplaceService.updateCharacteristic(this.platform.Characteristic.On, this.state.On);

      this.fuelLevelService.updateCharacteristic(this.platform.Characteristic.BatteryLevel, this.state.FuelLevel * (100/4));
    });
  }

  async setOn(value: CharacteristicValue) {
    this.platform.log.info('Setting On to ->', value);

    if (value as boolean === true) {
      if (this.state.StatusCode === 20 ) { // 20 - WORKING
        return true;
      }

      const params = new url.URLSearchParams({'__SL_P_UBT' : 'ButtonStart'});
      axios.post('http://' + this.platform.config.IP + '/No_content', params.toString());
    } else {
      const params = new url.URLSearchParams({'__SL_P_UBT' : 'ButtonStop'});
      axios.post('http://' + this.platform.config.IP + '/No_content', params.toString());
    }

    return value;
  }

  async getOn(): Promise<CharacteristicValue> {
    return this.state.StatusCode === 20; // 20 - WORKING
  }

  async setFlameSize(value: CharacteristicValue) {
    const targetFlame = Math.floor(value as number / (100/6)) + 1;
    let noOfSteps = targetFlame - this.state.FlameSize;

    this.platform.log.info('Set Flame size to ' + value + '%, ' + ', from ' + this.state.FlameSize +
      ' to ' + targetFlame + ' in Planika levels.');

    let operation = 'ButtonPlus';

    if (noOfSteps<0) {
      operation = 'ButtonMinus';
      noOfSteps = noOfSteps * -1;
    }

    for (let i = 0 ; i<noOfSteps ; i++) {
      const params = new url.URLSearchParams({'__SL_P_UBT' : operation});

      axios.post('http://' + this.platform.config['IP'] + '/No_content', params.toString());
    }

    this.RefreshState();
  }

  async getFlameSize(): Promise<CharacteristicValue> {
    return this.state.FlameSize * (100/6);
  }

  async getStatusLowBattery(): Promise<CharacteristicValue> {
    if (this.state.FuelLevel === 0) {
      return this.platform.Characteristic.StatusLowBattery.BATTERY_LEVEL_LOW;
    } else {
      return this.platform.Characteristic.StatusLowBattery.BATTERY_LEVEL_NORMAL;
    }
  }

  async getBatteryLevel(): Promise<CharacteristicValue> {
    return this.state.FuelLevel * (100/4);
  }

  async getChargingState(): Promise<CharacteristicValue> {
    return (this.state.StatusCode === 11 || this.state.StatusCode === 12); // 11 - AUTOREFUEL, 12 - REFUELING
  }
}
