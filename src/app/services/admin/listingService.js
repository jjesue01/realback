const listingModel = require("../../models/listing");
const nftModel = require("../../models/nft");
const qTransform = require("../../utils/queryTransform");
const {ObjectId} = require("bson");

async function getListings(query, page, limit, sort= 'bid.highest:asc') {
    const field = sort.split(':');
    const orderBy = field[1] == 'asc' ? '-1' : '1';
    const filters = {};
    const ors = [];

    if (query.user_id) {
        filters['owner'] = query.user_id;
    }
    if (query.city) {
        filters['city.ID'] = qTransform.inObjectIDQuery(query.city, ',');
    }
    if (query.cityUrl) {
        filters['city.url'] = query.cityUrl;
    }

    if (query.search) {
        const q = query.search;
        ors.push({'name': qTransform.regexLike(q)});
        ors.push({'address': qTransform.regexLike(q)});
        ors.push({'city.name': qTransform.regexLike(q)});
    }

    if (query.keyword) {
        const q = query.keyword.split(',');
        for await (const s of q) {
            ors.push({'name': qTransform.regexLike(s)});
            ors.push({'address': qTransform.regexLike(s)});
            ors.push({'city.name': qTransform.regexLike(s)});
            ors.push({'description': qTransform.regexLike(s)});
            ors.push({'tags': qTransform.regexLike(s)});
        }
    }

    if (query.exclude) {
        filters['_id'] = {$ne: new ObjectId(query.exclude)};
    }

    if (query.price) {
        const prc = query.price.split(',');
        filters['price'] = qTransform.rangeNumber(prc[0], prc[1]);
    }
    if (query.tags) {
        const q = query.tags.split(',');
        for await (const s of q) {
            ors.push({'tags': qTransform.regexLike(s)});
        }
    }
    if (query.resource) {
        filters['resource'] = qTransform.inQuery(query.resource, ',');
    }
    if (query.bounds) {
        const [south, west, north, east] = query.bounds.split(',');
        filters['geoLocation'] = {
            $geoWithin: {
                $geometry: {
                    type: 'Polygon',
                    coordinates: [
                        [
                            [
                                west,
                                south,
                            ],
                            [
                                west,
                                north,
                            ],
                            [
                                east,
                                north,
                            ],
                            [
                                east,
                                south,
                            ],
                            [
                                west,
                                south,
                            ],
                        ],
                    ],
                },
            },
        };
    }

    if (ors.length > 0) {
        filters['$or'] = ors;
    }

    if (query.startDate || query.endDate) {
        let nftIds = [];
        const nft_ands=[{"ipfs":{$exists:true}}];
        if (query.startDate) {
            const date_from = new Date(query.startDate).toISOString();
            nft_ands.push({"createdAt": {$gte: date_from}});
        }
        if (query.endDate) {
            let date_to = new Date(query.endDate)
            date_to = new Date(date_to.setDate(date_to.getDate()+1)).toISOString();
            nft_ands.push({"createdat": {$lt: date_to}});
        }
        const nfts = await nftModel.find(
            {$and: nft_ands}
        );
        console.log('nfts', nfts.length);
        nfts.forEach((item) => {
            nftIds.push(item._id);
        });
        filters['nfts'] = {$in: nftIds};
    }

    console.log(filters);
    const listings = await listingModel
        .paginate(filters, {page: page, populate: 'nfts', limit: limit, sort: {[field[0]]: orderBy}});
    return listings;
}

async function download(id) {
    const item = await listingModel.findById(id).orFail(
        () => Error('NotFound'),
    ).populate('nfts',
        // eslint-disable-next-line max-len
        'ipfs.file.originalName ipfs.file.path').select('ipfs.file.path');
    return item;
}

module.exports = {
    getListings,
    download
}