import * as rp from 'request-promise';
import * as bluebird from 'bluebird';
import * as _ from 'lodash';

const RANCHER_URL = process.env.RANCHER_URL;
const RANCHER_TOKEN = process.env.RANCHER_TOKEN;
const CATALOG = process.env.CATALOG;
const CHART_NAME = process.env.CHART_NAME;
const CHART_TAGS = process.env.CHART_TAGS;

if (!RANCHER_URL) { throw new Error('RANCHER_URL is required'); }
if (!RANCHER_TOKEN) { throw new Error('RANCHER_TOKEN is required'); }
if (!CATALOG) { throw new Error('CATALOG is required'); }
if (!CHART_NAME) { throw new Error('CHART_NAME is required'); }
if (!CHART_TAGS) { throw new Error('CHART_TAGS is required'); }

const config: any = {
    url: RANCHER_URL,
    token: RANCHER_TOKEN,
    catalog: CATALOG,
    chartName: CHART_NAME,
    chartTags: CHART_TAGS,
};

function sleep(ms) {
    return new Promise(resolve => {
        setTimeout(resolve, ms);
    });
}

class App {
    _rp = rp.defaults({
        rejectUnauthorized: false,
        headers: {
            'Accept': 'application/json',
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${config.token}`,
        },
    });
    constructor() {

    }

    async run(): Promise<void> {
        await this.getCatalog();
        const appLinks: string[] = await this.getProjects();
        const apps = await bluebird.mapSeries(appLinks, async (link) => {
            const result = await this.getApps(link);
            return JSON.parse(result).data;
        });
        const autoUpdatableApps =
            _.flatten(apps).filter(a => !!a && a.answers['rancher.autoUpdate']);

        console.log('autoUpdatableApps', autoUpdatableApps);
        const filtered = this.filterApp(autoUpdatableApps);
        console.log('filtered', filtered);
        await bluebird.mapSeries(filtered, f => {
            return this.upgradeApp(f);
        });
        return null;
    }

    async getCatalog(): Promise<any> {
        await this._rp(`${config.url}/catalogs/${config.catalog}?action=refresh`);
        let counter = 0;
        let catalog = null;
        while (counter < 15) {
            catalog = await this._rp(`${config.url}/catalogs/${config.catalog}`);
            if (catalog.Transitioning !== 'yes') {
                break;
            }
            console.log('transiting');
            sleep(2000);
            counter++;
        }
        if (!catalog) {
            return null;
        }
        // console.log('catalog', catalog);

    }

    async getProjects(): Promise<any> {
        const result = await this._rp(`${config.url}/projects`);
        const data = JSON.parse(result).data;
        return data.map((d) => d.links.apps);
    }

    async getApps(url: string): Promise<any> {
        return this._rp(url);
    }

    filterApp(apps: any[]): any[] {

        const result = apps.map(a => {
            console.log('a', a);
            const extId: string = a.externalId;
            console.log('extId', extId);
            const regex = /^catalog:\/\/\?catalog=(.*)&template=(.*)&version=(.*)$/;
            const matches = extId.match(regex);
            const [a1, catalog, template, version] = matches;
            console.log('matches', matches);
            console.log('a1, b1, c1, d1', { a1, catalog, template, version });
            const upgradeUrl = a.actions.upgrade;
            return { catalog, template, version, upgradeUrl, answers: a.answers };
        }).filter(a => {
            return config.catalog === a.catalog && config.chartName === a.template;
        });

        return result;
    }

    extractTag(): string {
        const index = config.chartTags.indexOf(',');
        return index >= 0 ? config.chartTags.substring(0, index) : config.chartTags;
    }
    async upgradeApp(ap: any): Promise<void> {
        const tag = this.extractTag();
        console.log('upgrading app', ap);
        console.log(`from ${ap.version} to ${tag}`);
        const newId = `catalog://?catalog=${ap.catalog}&template=${ap.template}&version=${tag}`;
        this._rp(ap.upgradeUrl, {
            method: 'POST',
            body: JSON.stringify({
                externalID: newId,
                answers: ap.answers,
            }),
        })
            .then(res => console.log('res', res));

        return;
    }

}

const app: App = new App();
app.run();